param(
    [string]$DeviceId = "",
    [ValidateSet("debug", "release")]
    [string]$BuildType = "debug",
    [switch]$SkipBuild,
    [switch]$AutoStartEmulator,
    [bool]$PhysicalOnly = $true,
    [string]$EmulatorName = "",
    [int]$WaitForDeviceSeconds = 180
)

$ErrorActionPreference = "Stop"
$nativeErrVar = Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
if ($nativeErrVar) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$repoRoot = Split-Path -Parent $PSCommandPath
$script:AdbExe = $null

function Resolve-AdbPath {
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    $candidates = @()
    if ($env:ANDROID_HOME) {
        $candidates += (Join-Path $env:ANDROID_HOME "platform-tools\adb.exe")
    }
    if ($env:ANDROID_SDK_ROOT) {
        $candidates += (Join-Path $env:ANDROID_SDK_ROOT "platform-tools\adb.exe")
    }
    if ($env:LOCALAPPDATA) {
        $candidates += "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
    }

    $candidates = @($candidates | Where-Object { $_ -and (Test-Path $_) })

    if ($candidates.Count -gt 0) {
        return [string]$candidates[0]
    }

    throw "ADB not found. Install Android SDK Platform-Tools or set ANDROID_HOME/ANDROID_SDK_ROOT."
}

function Resolve-EmulatorPath {
    $cmd = Get-Command emulator -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    $candidates = @()
    if ($env:ANDROID_HOME) {
        $candidates += (Join-Path $env:ANDROID_HOME "emulator\emulator.exe")
    }
    if ($env:ANDROID_SDK_ROOT) {
        $candidates += (Join-Path $env:ANDROID_SDK_ROOT "emulator\emulator.exe")
    }
    if ($env:LOCALAPPDATA) {
        $candidates += "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe"
    }

    $candidates = @($candidates | Where-Object { $_ -and (Test-Path $_) })
    if ($candidates.Count -gt 0) {
        return [string]$candidates[0]
    }

    throw "Android emulator executable not found. Install Android SDK Emulator component."
}

function Get-AdbOutput {
    if (-not $script:AdbExe) {
        $script:AdbExe = Resolve-AdbPath
    }
    return (& $script:AdbExe devices) -join "`n"
}

function Get-ConnectedDevices {
    if (-not $script:AdbExe) {
        $script:AdbExe = Resolve-AdbPath
    }

    $raw = & $script:AdbExe devices
    $devices = @()
    foreach ($line in $raw) {
        if ($line -match '^\s*([^\s]+)\s+device$') {
            $devices += $Matches[1]
        }
    }
    return ,$devices
}

function Get-UnauthorizedDevices {
    if (-not $script:AdbExe) {
        $script:AdbExe = Resolve-AdbPath
    }

    $raw = & $script:AdbExe devices
    $devices = @()
    foreach ($line in $raw) {
        if ($line -match '^\s*([^\s]+)\s+unauthorized$') {
            $devices += $Matches[1]
        }
    }
    return ,$devices
}

function Test-EmulatorSerial {
    param([string]$Serial)

    if ([string]::IsNullOrWhiteSpace($Serial)) {
        return $false
    }

    return $Serial -match '^emulator-\d+$'
}

function Get-OfflineEmulators {
    if (-not $script:AdbExe) {
        $script:AdbExe = Resolve-AdbPath
    }

    $raw = & $script:AdbExe devices
    $serials = @()
    foreach ($line in $raw) {
        if ($line -match '^\s*(emulator-\d+)\s+offline$') {
            $serials += $Matches[1]
        }
    }
    return $serials
}

function Get-AvailableAvds {
    $emulatorExe = Resolve-EmulatorPath
    $raw = @(& $emulatorExe -list-avds)
    $avdRoot = Join-Path $env:USERPROFILE ".android\avd"
    $avds = @()
    foreach ($line in $raw) {
        $name = [string]$line
        if (-not [string]::IsNullOrWhiteSpace($name)) {
            $candidate = $name.Trim()
            if ($candidate -match '^[A-Za-z0-9._-]+$') {
                if (-not [string]::IsNullOrWhiteSpace($avdRoot)) {
                    $avdPath = Join-Path $avdRoot "$candidate.avd"
                    if (Test-Path $avdPath) {
                        $avds += $candidate
                    }
                }
            }
        }
    }
    return ,$avds
}

function Start-EmulatorAndWait {
    param(
        [string]$AvdName,
        [int]$TimeoutSeconds = 90,
        [switch]$ColdBoot
    )

    if ([string]::IsNullOrWhiteSpace($AvdName)) {
        throw "AVD name is required to start emulator."
    }

    $emulatorExe = Resolve-EmulatorPath
    Write-Host "[SOLQ] Starting emulator: $AvdName"
    $emuArgs = @("-avd", $AvdName, "-netdelay", "none", "-netspeed", "full")
    if ($ColdBoot) {
        $emuArgs += @("-no-snapshot-load", "-no-boot-anim")
    }
    Start-Process -FilePath $emulatorExe -ArgumentList $emuArgs | Out-Null

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $emulatorSerial = ""

    do {
        Start-Sleep -Seconds 2
        $rawDevices = & $script:AdbExe devices
        foreach ($line in $rawDevices) {
            if ($line -match '^\s*(emulator-\d+)\s+device$') {
                $emulatorSerial = $Matches[1]
                break
            }
        }
        if (-not [string]::IsNullOrWhiteSpace($emulatorSerial)) {
            break
        }
    } while ((Get-Date) -lt $deadline)

    if ([string]::IsNullOrWhiteSpace($emulatorSerial)) {
        return @()
    }

    Write-Host "[SOLQ] Emulator detected: $emulatorSerial. Waiting for Android boot completion..."

    do {
        Start-Sleep -Seconds 2
        try {
            $boot = (& $script:AdbExe -s $emulatorSerial shell getprop sys.boot_completed 2>$null) -join ""
            if ($boot.Trim() -eq "1") {
                return Get-ConnectedDevices
            }
        } catch {
            # keep waiting until timeout
        }
    } while ((Get-Date) -lt $deadline)

    return Get-ConnectedDevices
}

function Get-ApplicationId {
    $gradleFile = Join-Path $repoRoot "android\app\build.gradle.kts"
    if (!(Test-Path $gradleFile)) {
        return "com.example.solq"
    }

    $content = Get-Content -Path $gradleFile -Raw
    $match = [regex]::Match($content, 'applicationId\s*=\s*"([^"]+)"')
    if ($match.Success) {
        return $match.Groups[1].Value
    }

    return "com.example.solq"
}

function Resolve-ApkPath {
    param([string]$Variant)

    if ($Variant -eq "release") {
        return "build\app\outputs\flutter-apk\app-release.apk"
    }
    return "build\app\outputs\flutter-apk\app-debug.apk"
}

function Test-ApkFreshAgainstSources {
    param([string]$ApkPath)

    if (-not (Test-Path $ApkPath)) {
        return $false
    }

    $apkTime = (Get-Item $ApkPath).LastWriteTimeUtc
    $latestSourceTime = Get-Date "2000-01-01"

    $sourceRoots = @(
        (Join-Path $repoRoot "lib"),
        (Join-Path $repoRoot "web"),
        (Join-Path $repoRoot "android\app\src"),
        (Join-Path $repoRoot "pubspec.yaml")
    )

    foreach ($root in $sourceRoots) {
        if (-not (Test-Path $root)) {
            continue
        }

        $item = Get-Item $root
        if (-not $item.PSIsContainer) {
            if ($item.LastWriteTimeUtc -gt $latestSourceTime) {
                $latestSourceTime = $item.LastWriteTimeUtc
            }
            continue
        }

        $latestInRoot = Get-ChildItem -Path $root -Recurse -File |
            Sort-Object LastWriteTimeUtc -Descending |
            Select-Object -First 1

        if ($latestInRoot -and $latestInRoot.LastWriteTimeUtc -gt $latestSourceTime) {
            $latestSourceTime = $latestInRoot.LastWriteTimeUtc
        }
    }

    return $apkTime -ge $latestSourceTime
}

function Invoke-SolqAdb {
    param([string[]]$AdbParams)

    if (-not $script:AdbExe) {
        $script:AdbExe = Resolve-AdbPath
    }

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        if ([string]::IsNullOrWhiteSpace($DeviceId)) {
            & $script:AdbExe @AdbParams 2>&1
        } else {
            & $script:AdbExe -s $DeviceId @AdbParams 2>&1
        }
    } finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Invoke-SolqAdbRaw {
    param([string[]]$AdbParams)

    if (-not $script:AdbExe) {
        $script:AdbExe = Resolve-AdbPath
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $script:AdbExe
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true

    $flatArgs = @()
    if (-not [string]::IsNullOrWhiteSpace($DeviceId)) {
        $flatArgs += "-s"
        $flatArgs += $DeviceId
    }
    $flatArgs += $AdbParams

    $quotedArgs = $flatArgs | ForEach-Object {
        $arg = [string]$_
        if ($arg -match '[\s"]') {
            '"' + ($arg -replace '"', '\"') + '"'
        } else {
            $arg
        }
    }
    $psi.Arguments = ($quotedArgs -join ' ')

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi

    [void]$proc.Start()
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()

    return @{
        ExitCode = $proc.ExitCode
        Output = ($stdout + $stderr).Trim()
    }
}

function Get-DeviceProperty {
    param([string]$PropertyName)

    try {
        $value = (Invoke-SolqAdb @("shell", "getprop", $PropertyName) | Out-String).Trim()
        return $value
    } catch {
        return ""
    }
}

function Get-DeviceAvailableStorageMb {
    try {
        $raw = (Invoke-SolqAdb @("shell", "df", "-k", "/storage/emulated/0") | Out-String)
        $line = ($raw -split "`r?`n" | Where-Object { $_ -match '^/dev/' } | Select-Object -First 1)
        if ([string]::IsNullOrWhiteSpace($line)) {
            return $null
        }

        $parts = ($line -split '\s+' | Where-Object { $_ -ne '' })
        if ($parts.Count -lt 4) {
            return $null
        }

        $availableKb = [double]$parts[3]
        return [math]::Floor($availableKb / 1024)
    } catch {
        return $null
    }
}

function Invoke-ApkInstall {
    param(
        [string]$ApkPath,
        [switch]$PreferNoStreaming
    )

    $defaultArgs = @("install", "-r", "-d", "-g", $ApkPath)

    if ($PreferNoStreaming) {
        $noStreamingArgs = @("install", "--no-streaming", "-r", "-d", "-g", $ApkPath)
        $firstTry = Invoke-SolqAdbRaw $noStreamingArgs
        if ($firstTry.Output -match "unknown option\s+--no-streaming") {
            return Invoke-SolqAdbRaw $defaultArgs
        }
        return $firstTry
    }

    return Invoke-SolqAdbRaw $defaultArgs
}

function Uninstall-IfExists {
    param([string]$Package)

    try {
        Invoke-SolqAdb @("shell", "am", "force-stop", $Package) | Out-Null
    } catch {
        # package may not be installed
    }

    try {
        Invoke-SolqAdb @("shell", "pm", "clear", $Package) | Out-Null
    } catch {
        # package may not be installed
    }

    try {
        $result = Invoke-SolqAdb @("uninstall", $Package) | Out-String
        if ($result -match "Success") {
            Write-Host "[SOLQ] Removed old package: $Package"
        }
    } catch {
        Write-Host "[SOLQ] Skip uninstall $Package"
    }
}

function Test-PackageInstalled {
    param([string]$Package)

    try {
        $result = (Invoke-SolqAdb @("shell", "pm", "list", "packages", $Package) | Out-String).Trim()
        if ([string]::IsNullOrWhiteSpace($result)) {
            return $false
        }

        $escaped = [regex]::Escape($Package)
        return ($result -match "package:$escaped")
    } catch {
        return $false
    }
}

function Get-LegacySolqPackages {
    $detected = @()

    try {
        $lines = Invoke-SolqAdb @("shell", "pm", "list", "packages")
        foreach ($line in $lines) {
            if ($line -match '^package:(.+)$') {
                $pkg = $Matches[1].Trim()
                if ($pkg -match '(?i)(solq|warungpay|solo)') {
                    $detected += $pkg
                }
            }
        }
    } catch {
        # ignore detection failures and continue with static uninstall list
    }

    return @($detected | Sort-Object -Unique)
}

Write-Host "[SOLQ] Resolving ADB target device..."
if (-not $script:AdbExe) {
    $script:AdbExe = Resolve-AdbPath
}

$devices = Get-ConnectedDevices
$physicalDevices = @($devices | Where-Object { -not (Test-EmulatorSerial $_) })
$unauthorizedDevices = Get-UnauthorizedDevices
$unauthorizedPhysicalDevices = @($unauthorizedDevices | Where-Object { -not (Test-EmulatorSerial $_) })
$targetAvd = $null

if ($PhysicalOnly) {
    if (-not [string]::IsNullOrWhiteSpace($DeviceId) -and (Test-EmulatorSerial $DeviceId)) {
        throw "PhysicalOnly mode aktif: DeviceId emulator tidak diizinkan ($DeviceId)."
    }

    if ($physicalDevices.Count -gt 0) {
        $devices = $physicalDevices
    }
}

if ($devices.Count -eq 0 -and $AutoStartEmulator -and -not $PhysicalOnly) {
    $targetAvd = $EmulatorName
    if ([string]::IsNullOrWhiteSpace($targetAvd)) {
        $availableAvds = Get-AvailableAvds
        if ($availableAvds.Count -eq 0) {
            throw "No Android Virtual Device (AVD) found. Create one in Android Studio Device Manager first."
        }
        $targetAvd = $availableAvds[0]
        Write-Host "[SOLQ] Auto-selected AVD: $targetAvd"
    }

    $devices = Start-EmulatorAndWait -AvdName $targetAvd -TimeoutSeconds $WaitForDeviceSeconds
}

if ($devices.Count -eq 0 -and $PhysicalOnly) {
    if ($unauthorizedPhysicalDevices.Count -gt 0) {
        $adbDump = Get-AdbOutput
        $unauthList = $unauthorizedPhysicalDevices -join ', '
        throw "ADB device terdeteksi tetapi belum diotorisasi (unauthorized): $unauthList`n`nLangkah perbaikan cepat:`n1) Cabut-pasang USB, unlock layar HP, lalu terima prompt RSA fingerprint (centang 'Always allow').`n2) Developer options: aktifkan USB debugging, lalu toggle OFF/ON sekali.`n3) (Xiaomi/HyperOS) aktifkan USB debugging (Security settings) + Install via USB.`n4) Jika masih gagal: Revoke USB debugging authorizations, reconnect, lalu jalankan ulang script.`n`nADB output:`n$adbDump"
    }

    $adbDump = Get-AdbOutput
    if ($unauthorizedDevices.Count -gt 0) {
        $emuUnauth = @($unauthorizedDevices | Where-Object { Test-EmulatorSerial $_ })
        if ($emuUnauth.Count -gt 0) {
            Write-Host "[SOLQ] Mengabaikan emulator unauthorized di mode PhysicalOnly: $($emuUnauth -join ', ')"
        }
    }
    throw "PhysicalOnly mode aktif: device fisik tidak terdeteksi. Hubungkan HP Android + aktifkan USB debugging. ADB output:`n$adbDump"
}

if ($devices.Count -eq 0) {
    $adbDump = Get-AdbOutput

    if ($adbDump -match 'offline') {
        Write-Host "[SOLQ] Emulator/device detected as OFFLINE. Restarting ADB server..."
        & $script:AdbExe reconnect offline | Out-Null
        Start-Sleep -Seconds 3

        $offlineSerials = Get-OfflineEmulators
        foreach ($serial in $offlineSerials) {
            try {
                Write-Host "[SOLQ] Killing offline emulator instance: $serial"
                & $script:AdbExe -s $serial emu kill | Out-Null
            } catch {
                Write-Host "[SOLQ] Could not kill $serial, continuing..."
            }
        }

        Start-Sleep -Seconds 4
        & $script:AdbExe kill-server | Out-Null
        & $script:AdbExe start-server | Out-Null
        Start-Sleep -Seconds 4

        if ($AutoStartEmulator -and -not [string]::IsNullOrWhiteSpace($targetAvd)) {
            Write-Host "[SOLQ] Relaunching emulator in cold boot mode: $targetAvd"
            $devices = Start-EmulatorAndWait -AvdName $targetAvd -TimeoutSeconds $WaitForDeviceSeconds -ColdBoot
        } else {
            $devices = Get-ConnectedDevices
        }

        if ($devices.Count -gt 0) {
            Write-Host "[SOLQ] Device recovered after ADB restart. Continuing..."
        }
        $adbDump = Get-AdbOutput
    }
}

if ($devices.Count -eq 0) {
    if ($unauthorizedDevices.Count -gt 0) {
        $adbDump = Get-AdbOutput
        $unauthList = $unauthorizedDevices -join ', '
        throw "ADB device belum diotorisasi (unauthorized): $unauthList. Unlock layar HP dan setujui RSA fingerprint, lalu jalankan ulang script.`nADB output:`n$adbDump"
    }

    $adbDump = Get-AdbOutput
    throw "ADB device not detected. Connect phone, enable USB debugging, or run script with -AutoStartEmulator. ADB output:`n$adbDump"
}

if ([string]::IsNullOrWhiteSpace($DeviceId)) {
    if ($devices.Count -gt 1) {
        throw "Multiple devices detected: $($devices -join ', '). Re-run with -DeviceId <serial>."
    }
    $DeviceId = $devices[0]
}

if (-not ($devices -contains $DeviceId)) {
    throw "Device '$DeviceId' is not online. Connected devices: $($devices -join ', ')"
}

Write-Host "[SOLQ] Target device: $DeviceId"

try {
    Invoke-SolqAdb @("get-state") | Out-Null
} catch {
    throw "Device '$DeviceId' not ready. Check USB debugging authorization."
}

$appId = Get-ApplicationId
Write-Host "[SOLQ] Active applicationId: $appId"

$deviceManufacturerRaw = Get-DeviceProperty -PropertyName "ro.product.manufacturer"
$deviceManufacturer = $deviceManufacturerRaw.ToLowerInvariant()
$deviceModel = Get-DeviceProperty -PropertyName "ro.product.model"
if (-not [string]::IsNullOrWhiteSpace($deviceManufacturerRaw) -or -not [string]::IsNullOrWhiteSpace($deviceModel)) {
    Write-Host "[SOLQ] Device profile: $deviceManufacturerRaw $deviceModel"
}

Write-Host "[SOLQ] Removing old debug/release variants..."
$detectedLegacyPackages = Get-LegacySolqPackages
if ($detectedLegacyPackages.Count -gt 0) {
    Write-Host "[SOLQ] Detected legacy installed packages: $($detectedLegacyPackages -join ', ')"
}

$legacyPackages = @(
    $appId,
    "com.example.solq",
    "com.example.solo",
    "com.example.SOLQ",
    "com.example.SOLO",
    "com.example.warungpay",
    "com.example.solq.debug",
    "com.example.solo.debug",
    "com.example.SOLQ.debug",
    "com.example.SOLO.debug",
    "$appId.debug"
)

$legacyPackages = @($legacyPackages + $detectedLegacyPackages)
foreach ($pkg in ($legacyPackages | Select-Object -Unique)) {
    Uninstall-IfExists -Package $pkg
}

Set-Location $repoRoot

$apkPath = Resolve-ApkPath -Variant $BuildType

if (-not $SkipBuild) {
    Write-Host "[SOLQ] Cleaning Flutter build..."
    flutter clean

    Write-Host "[SOLQ] Downloading dependencies..."
    flutter pub get

    Write-Host "[SOLQ] Building $BuildType APK..."
    if ($BuildType -eq "release") {
        flutter build apk --release
    } else {
        flutter build apk --debug
    }
} else {
    if (-not (Test-Path $apkPath)) {
        throw "SkipBuild aktif tetapi APK tidak ditemukan di $apkPath. Jalankan tanpa -SkipBuild."
    }

    if (-not (Test-ApkFreshAgainstSources -ApkPath $apkPath)) {
        throw "SkipBuild ditolak: APK lebih lama dari source terbaru, berisiko memasang versi lama (bug manual-address/scan). Jalankan ulang tanpa -SkipBuild agar build fresh terpasang."
    }

    Write-Host "[SOLQ] Skip build enabled. Using existing APK artifact."
}

if (!(Test-Path $apkPath)) {
    throw "APK not found at $apkPath"
}

Write-Host "[SOLQ] Installing $BuildType APK via adb install..."
try {
    Invoke-SolqAdb @("logcat", "-c") | Out-Null
} catch {
    # ignore if logcat clear is not available
}

$isXiaomiFamily = ($deviceManufacturer -match "xiaomi|redmi|poco")
if ($isXiaomiFamily) {
    try {
        # This exported MIUI activity often primes the one-time ADB install consent dialog.
        Invoke-SolqAdb @("shell", "am", "start", "-n", "com.miui.securitycenter/com.miui.permcenter.install.AdbInstallActivity") | Out-Null
    } catch {
        # keep going if activity cannot be opened on this ROM build
    }
}

$installResult = Invoke-ApkInstall -ApkPath $apkPath -PreferNoStreaming:$isXiaomiFamily
$installOutput = [string]$installResult.Output
$installExit = [int]$installResult.ExitCode

if ($installExit -ne 0 -or $installOutput -match "Failure") {
    if (($installOutput -notmatch "INSTALL_FAILED_") -and ($installOutput -notmatch "Failed to free") -and ($installOutput -notmatch "failed to write")) {
        try {
            $diagOutput = ((Invoke-SolqAdb @("install", "-r", "-d", "-g", $apkPath)) 2>&1 | Out-String).Trim()
            if (-not [string]::IsNullOrWhiteSpace($diagOutput)) {
                $installOutput = ($installOutput + " | diag: " + $diagOutput).Trim()
            }
        } catch {
            # ignore secondary install diagnostics failure
        }
    }

    if (($installOutput -notmatch "INSTALL_FAILED_") -and ($installOutput -notmatch "Failed to free") -and ($installOutput -notmatch "failed to write")) {
        try {
            $hintLines = Invoke-SolqAdb @("logcat", "-d") |
                Select-String -Pattern "INSTALL_FAILED_[A-Z_]+|Install canceled by user|Failed to free [0-9]+ on storage device|failed to write|AdbInstallActivity" -CaseSensitive:$false |
                Select-Object -Last 10 |
                ForEach-Object { $_.Line.Trim() }

            $hintText = ($hintLines -join " | ").Trim()
            if (-not [string]::IsNullOrWhiteSpace($hintText)) {
                $installOutput = ($installOutput + " | logcat: " + $hintText).Trim()
            }
        } catch {
            # ignore logcat parsing failure
        }
    }
}

if ($installExit -ne 0 -or $installOutput -match "Failure") {
    if (Test-PackageInstalled -Package $appId) {
        Write-Host "[SOLQ] APK terdeteksi sudah terpasang di device meski output ADB mengandung failure hint. Melanjutkan launch..."
        $installExit = 0
    }
}

if ($installExit -ne 0 -or $installOutput -match "Failure") {
    if ($installOutput -match "Failed to free\s+(\d+)\s+on storage device") {
        $requiredBytes = [double]$Matches[1]
        $requiredMb = [math]::Ceiling($requiredBytes / 1MB)
        $suggestedMb = $requiredMb + 300
        $availableMb = Get-DeviceAvailableStorageMb

        if ($null -ne $availableMb) {
            throw "Storage HP tidak cukup untuk install APK. Dibutuhkan minimal ${requiredMb}MB free, saat ini sekitar ${availableMb}MB. Bebaskan minimal ${suggestedMb}MB lalu jalankan ulang script. Detail: $installOutput"
        }

        throw "Storage HP tidak cukup untuk install APK. Dibutuhkan minimal ${requiredMb}MB free. Bebaskan ruang lalu jalankan ulang script. Detail: $installOutput"
    }

    if ($installOutput -match "failed to write") {
        $availableMb = Get-DeviceAvailableStorageMb
        if ($null -ne $availableMb) {
            throw "Install gagal karena storage HP penuh (failed to write). Free space saat ini sekitar ${availableMb}MB. Bebaskan ruang minimal 1GB lalu jalankan ulang script. Detail: $installOutput"
        }

        throw "Install gagal karena storage HP penuh (failed to write). Bebaskan ruang minimal 1GB lalu jalankan ulang script. Detail: $installOutput"
    }

    if ($installOutput -match "INSTALL_FAILED_USER_RESTRICTED") {
        try {
            Invoke-SolqAdb @("shell", "am", "start", "-a", "android.settings.APPLICATION_DEVELOPMENT_SETTINGS") | Out-Null
        } catch {
            # ignore if settings activity cannot be opened
        }

        if ($isXiaomiFamily) {
            try {
                Invoke-SolqAdb @("shell", "am", "start", "-n", "com.miui.securitycenter/com.miui.permcenter.install.AdbInstallActivity") | Out-Null
                $retryResult = Invoke-ApkInstall -ApkPath $apkPath -PreferNoStreaming
                $retryOutput = [string]$retryResult.Output
                $retryExit = [int]$retryResult.ExitCode

                if ($retryExit -eq 0 -and $retryOutput -notmatch "Failure") {
                    $installResult = $retryResult
                    $installOutput = $retryOutput
                    $installExit = $retryExit
                } else {
                    $installOutput = ($installOutput + " | retry: " + $retryOutput).Trim()
                    throw "APK install ditolak oleh perangkat Xiaomi/HyperOS (INSTALL_FAILED_USER_RESTRICTED). Buka Developer options lalu aktifkan: (1) USB debugging, (2) USB debugging (Security settings), (3) Install via USB. Setelah itu buka kunci layar HP, setujui prompt Security Center (AdbInstallActivity), lalu jalankan ulang script. Detail: $installOutput"
                }
            } catch {
                if ($_.Exception.Message -like "APK install ditolak oleh perangkat Xiaomi/HyperOS*") {
                    throw
                }

                throw "APK install ditolak oleh perangkat Xiaomi/HyperOS (INSTALL_FAILED_USER_RESTRICTED). Buka Developer options lalu aktifkan: (1) USB debugging, (2) USB debugging (Security settings), (3) Install via USB. Setelah itu buka kunci layar HP, setujui prompt Security Center (AdbInstallActivity), lalu jalankan ulang script. Detail: $installOutput"
            }
        }

        throw "APK install ditolak oleh perangkat (INSTALL_FAILED_USER_RESTRICTED). Buka layar HP dan izinkan instalasi (Install via USB / Allow from this source), lalu jalankan ulang script. Detail: $installOutput"
    }

    throw "ADB install gagal (exit=$installExit): $installOutput"
}

if ($installOutput) {
    Write-Host $installOutput
}

Write-Host "[SOLQ] Launching app..."
$launchOutput = ((Invoke-SolqAdb @("shell", "monkey", "-p", $appId, "-c", "android.intent.category.LAUNCHER", "1")) 2>&1 | Out-String).Trim()
$launchExit = $LASTEXITCODE
if ($launchExit -ne 0) {
    throw "Gagal launch app via monkey (exit=$launchExit): $launchOutput"
}

if ($launchOutput) {
    Write-Host $launchOutput
}

Write-Host "[SOLQ] Done. $BuildType APK installed cleanly and launched on $DeviceId."
