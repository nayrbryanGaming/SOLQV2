// screens.jsx — SOLQ 2.0 · Complete rebuild
// Brand: Purple #9333EA · Blue #3B82F6 · Teal #10D9AA

const { useState, useEffect } = React;

const T = {
  bg: '#FAFAFE', ink: '#0D0620', ink2: '#2D1B4E', ink3: '#7B6E9A',
  line: '#E8E0F8', card: '#FFFFFF', cardAlt: '#F2EEF9',
  primary: '#8B2EE8', primaryDark: '#6B1FD9', primarySoft: '#F0E5FD',
  teal: '#10D9AA', tealSoft: '#E0F9F3', tealFg: '#0A7A5F',
  blue: '#3B82F6',
  ok: '#10D9AA', okSoft: '#E0F9F3', okFg: '#0A7A5F',
  warn: '#F59E0B', warnSoft: '#FEF3C7', warnFg: '#92400E',
  err: '#EF4444', errSoft: '#FEE2E2', errFg: '#991B1B',
};
const grad     = 'linear-gradient(135deg,#9333EA 0%,#3B82F6 52%,#10D9AA 100%)';
const fontUI   = `'Inter',-apple-system,system-ui,sans-serif`;
const fontMono = `'JetBrains Mono',ui-monospace,monospace`;

// ─── Logo SVG ────────────────────────────────────────────────────────────────
const SolqQ = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="qg-outer" x1="5" y1="5" x2="95" y2="95" gradientUnits="userSpaceOnUse">
        <stop offset="0%"  stopColor="#9B2FEA"/>
        <stop offset="42%" stopColor="#3B6CF7"/>
        <stop offset="100%" stopColor="#10D9AA"/>
      </linearGradient>
      <linearGradient id="qg-depth" x1="8" y1="8" x2="62" y2="88" gradientUnits="userSpaceOnUse">
        <stop offset="0%"  stopColor="#7B1FD8" stopOpacity="0.75"/>
        <stop offset="100%" stopColor="#1D50E8" stopOpacity="0.55"/>
      </linearGradient>
      <linearGradient id="qg-tail" x1="42" y1="58" x2="92" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0%"  stopColor="#10D9AA"/>
        <stop offset="100%" stopColor="#06B6D4"/>
      </linearGradient>
    </defs>
    <path fill="url(#qg-depth)"
      d="M50 6C75 6 96 27 96 52C96 74 80 91 59 95L70 100H50H30L18 93C6 85 4 70 4 52C4 27 25 6 50 6Z
         M50 22C34 22 20 36 20 52C20 68 34 82 50 82C66 82 80 68 80 52C80 36 66 22 50 22Z"/>
    <path fill="url(#qg-outer)"
      d="M50 10C73.2 10 92 28.8 92 52C92 73.5 76.8 91 57 94.5L67 99H50H33L22 93C10 85 8 70 8 52C8 28.8 26.8 10 50 10Z
         M50 26C35.2 26 24 37.2 24 52C24 66.8 35.2 78 50 78C64.8 78 76 66.8 76 52C76 37.2 64.8 26 50 26Z"/>
    <path fill="url(#qg-tail)"
      d="M55 67C63 76 71 85 77 95L65 100C58 91 50 81 44 71C48 70 52 68.5 55 67Z"/>
  </svg>
);

// ─── Atoms ────────────────────────────────────────────────────────────────────
const GradBtn = ({ children, onClick, disabled, size = 'md', variant = 'primary', full = true }) => {
  const pad = size === 'lg' ? '15px 20px' : '12px 18px';
  const fs  = size === 'lg' ? 15 : 14;
  if (variant === 'ghost') return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      padding: pad, borderRadius: 14, width: full ? '100%' : 'auto',
      background: 'transparent', color: T.primary, border: `1.5px solid ${T.primary}`,
      fontFamily: fontUI, fontSize: fs, fontWeight: 600, letterSpacing: -0.1,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
    }}>{children}</button>
  );
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      padding: pad, borderRadius: 14, width: full ? '100%' : 'auto',
      background: disabled ? T.line : grad, color: '#fff', border: 'none',
      fontFamily: fontUI, fontSize: fs, fontWeight: 600, letterSpacing: -0.1,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
      boxShadow: disabled ? 'none' : '0 4px 20px rgba(139,46,232,0.32)',
    }}>{children}</button>
  );
};

const Chip = ({ children, tone = 'neutral' }) => {
  const map = {
    neutral: { bg: T.cardAlt,    fg: T.ink2 },
    ok:      { bg: T.okSoft,     fg: T.okFg },
    warn:    { bg: T.warnSoft,   fg: T.warnFg },
    primary: { bg: T.primarySoft,fg: T.primaryDark },
    err:     { bg: T.errSoft,    fg: T.errFg },
  };
  const s = map[tone] || map.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20,
      background: s.bg, color: s.fg,
      fontFamily: fontUI, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
    }}>{children}</span>
  );
};

const Dot = ({ color = T.ok, size = 6, pulse }) => (
  <span style={{
    display: 'inline-block', width: size, height: size, borderRadius: '50%',
    background: color, flexShrink: 0,
    animation: pulse ? 'solq-pulse 1.4s ease-in-out infinite' : 'none',
  }} />
);

const Row = ({ label, value, mono, sub, last }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '11px 0', borderBottom: last ? 'none' : `1px solid ${T.line}`, gap: 12,
  }}>
    <div style={{ fontSize: 13, color: T.ink3, fontFamily: fontUI }}>{label}</div>
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 13, color: T.ink, fontFamily: mono ? fontMono : fontUI, fontWeight: 500 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.ink3, marginTop: 2, fontFamily: fontMono }}>{sub}</div>}
    </div>
  </div>
);

const TopBar = ({ title, onBack, right }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 18px 14px', borderBottom: `1px solid ${T.line}`, background: T.bg,
  }}>
    <div style={{ width: 36 }}>
      {onBack && (
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.line}`,
          background: T.card, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke={T.ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
    <div style={{ fontFamily: fontUI, fontSize: 14, fontWeight: 600, color: T.ink, letterSpacing: -0.2 }}>{title}</div>
    <div style={{ width: 36, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
  </div>
);

const Card = ({ children, style = {} }) => (
  <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, overflow: 'hidden', ...style }}>
    {children}
  </div>
);

// ─── Screen 1: Connect Wallet ─────────────────────────────────────────────────
function ConnectScreen({ onConnect }) {
  const [selected, setSelected] = useState(null);
  const wallets = [
    { id: 'phantom',  name: 'Phantom',              sub: 'Browser · Mobile · Solana-native', accent: '#AB9FF2' },
    { id: 'solflare', name: 'Solflare',              sub: 'Browser · Mobile · Multi-chain',   accent: '#FC9965' },
    { id: 'backpack', name: 'Backpack',              sub: 'Mobile · xNFT runtime',             accent: '#E43431' },
    { id: 'mwa',      name: 'Mobile Wallet Adapter', sub: 'Any MWA-compatible wallet',         accent: '#9945FF' },
  ];

  return (
    <div style={{ background: T.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{ height: 3, background: grad }} />

      <div style={{ padding: '32px 24px 0' }}>
        <SolqQ size={44} />
        <h1 style={{ fontFamily: fontUI, fontSize: 26, fontWeight: 700, color: T.ink, letterSpacing: -0.8, margin: '20px 0 8px', lineHeight: 1.2 }}>
          Connect your Solana wallet
        </h1>
        <p style={{ fontFamily: fontUI, fontSize: 14, color: T.ink3, lineHeight: 1.55, margin: 0 }}>
          SOLQ is non-custodial — keys stay in your wallet. We only read your public address.
        </p>
      </div>

      <div style={{ padding: '24px 24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {wallets.map(w => {
          const active = selected === w.id;
          return (
            <button key={w.id} onClick={() => setSelected(w.id)} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', borderRadius: 14,
              background: active ? grad : T.card,
              border: `1.5px solid ${active ? 'transparent' : T.line}`,
              cursor: 'pointer', textAlign: 'left',
              boxShadow: active ? '0 4px 24px rgba(147,51,234,0.3)' : 'none',
              transition: 'all .15s ease',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: active ? 'rgba(255,255,255,0.18)' : T.cardAlt,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: fontMono, fontSize: 15, fontWeight: 700,
                color: active ? '#fff' : w.accent,
              }}>{w.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: fontUI, fontSize: 14, fontWeight: 600, color: active ? '#fff' : T.ink }}>{w.name}</div>
                <div style={{ fontFamily: fontUI, fontSize: 11, color: active ? 'rgba(255,255,255,0.65)' : T.ink3, marginTop: 2 }}>{w.sub}</div>
              </div>
              {active && (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="9" fill="rgba(255,255,255,0.2)"/>
                  <path d="M6 10l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ padding: '20px 24px 32px' }}>
        <div style={{
          padding: '12px 14px', borderRadius: 12, background: T.primarySoft,
          fontFamily: fontUI, fontSize: 12, color: T.primaryDark, lineHeight: 1.5,
          marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
            <circle cx="7" cy="7" r="6" stroke={T.primary} strokeWidth="1.2"/>
            <path d="M7 6v3M7 4.5v.1" stroke={T.primary} strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span><strong>Non-custodial:</strong> Private key never leaves your wallet. Every transaction is signed locally.</span>
        </div>
        <GradBtn onClick={() => selected && onConnect(selected)} disabled={!selected} size="lg">
          {selected ? `Connect ${wallets.find(w => w.id === selected)?.name}` : 'Select a wallet to continue'}
        </GradBtn>
      </div>
    </div>
  );
}

// ─── Screen 2: Home ───────────────────────────────────────────────────────────
function HomeScreen({ wallet, onScan, onHistory }) {
  return (
    <div style={{ background: T.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <TopBar
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <SolqQ size={22} />
            <span style={{ fontFamily: fontUI, fontSize: 16, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>SOLQ</span>
          </div>
        }
        right={
          <button onClick={onHistory} style={{
            width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.line}`,
            background: T.card, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h10M2 10h6" stroke={T.ink} strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        }
      />

      {/* Wallet card */}
      <div style={{ padding: '18px 18px 0' }}>
        <div style={{
          borderRadius: 20, padding: '22px 20px', background: grad,
          boxShadow: '0 8px 36px rgba(147,51,234,0.28)', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ position: 'absolute', bottom: -24, left: -24, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <Dot color={T.teal} size={7} pulse />
            <span style={{ fontFamily: fontUI, fontSize: 11, color: 'rgba(255,255,255,0.75)', letterSpacing: 0.6, textTransform: 'uppercase' }}>Connected · Mainnet</span>
          </div>
          <div style={{ fontFamily: fontMono, fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 16, letterSpacing: 0.3 }}>
            {wallet.address}
          </div>
          <div style={{ display: 'flex', gap: 28 }}>
            <div>
              <div style={{ fontFamily: fontUI, fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 }}>SOL</div>
              <div style={{ fontFamily: fontUI, fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: -0.7, marginTop: 2 }}>{wallet.sol}</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.18)' }} />
            <div>
              <div style={{ fontFamily: fontUI, fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 }}>USDC</div>
              <div style={{ fontFamily: fontUI, fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: -0.7, marginTop: 2 }}>{wallet.usdc}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Scan CTA */}
      <div style={{ padding: '14px 18px 0' }}>
        <button onClick={onScan} style={{ width: '100%', border: 'none', cursor: 'pointer', background: 'transparent', padding: 0 }}>
          <div style={{ borderRadius: 20, padding: '22px 20px', background: T.ink, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -20, top: -20, width: 150, height: 150, borderRadius: '50%', background: 'rgba(147,51,234,0.1)' }} />
            <div style={{ position: 'absolute', right: 18, top: 18, width: 70, height: 70, borderRadius: '50%', background: 'rgba(16,217,170,0.08)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
                  <rect x="11.5" y="1.5" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
                  <rect x="1.5" y="11.5" width="5" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
                  <path d="M11.5 11.5h2v2h-2zM15.5 11.5v4M13.5 15.5h2" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <span style={{ fontFamily: fontMono, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8 }}>EMVCo · TAG 26/27/54</span>
            </div>
            <div style={{ fontFamily: fontUI, fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.2, letterSpacing: -0.4, marginBottom: 6 }}>
              Scan QRIS sticker
            </div>
            <div style={{ fontFamily: fontUI, fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 18 }}>
              Merchant gets Rupiah via BI-FAST · powered by Solana
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 22, background: grad, boxShadow: '0 2px 14px rgba(147,51,234,0.45)' }}>
              <span style={{ fontFamily: fontUI, fontSize: 13, fontWeight: 600, color: '#fff' }}>Scan now</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </button>
      </div>

      {/* Live rates */}
      <div style={{ padding: '14px 18px 0' }}>
        <div style={{ fontFamily: fontUI, fontSize: 11, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Live rates</div>
        <Card style={{ padding: '4px 16px' }}>
          <Row label="1 SOL"        value="Rp 2,847,200" sub="CoinGecko · 28s ago" mono />
          <Row label="1 USDC"       value="Rp 16,318"    sub="CoinGecko · 28s ago" mono />
          <Row label="Settlement"   value="IDRX → BI-FAST" last />
        </Card>
      </div>

      <div style={{ flex: 1, minHeight: 20 }} />
      <div style={{ padding: '12px 20px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: grad }} />
        <span style={{ fontFamily: fontUI, fontSize: 11, color: T.ink3 }}>Non-custodial · BI/OJK-aware · Solana mainnet</span>
      </div>
    </div>
  );
}

// ─── Screen 3: Scan ───────────────────────────────────────────────────────────
function ScanScreen({ onDecode, onBack, qrType }) {
  const [progress, setProgress] = useState(0);
  const [phase,    setPhase]    = useState(0);

  useEffect(() => {
    const i = setInterval(() => setProgress(p => p >= 100 ? 100 : p + (p < 55 ? 3.2 : p < 85 ? 1.6 : 0.9)), 80);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (progress >= 100) { const t = setTimeout(() => onDecode(qrType), 300); return () => clearTimeout(t); }
    if (progress >= 70) setPhase(2);
    else if (progress >= 35) setPhase(1);
    else setPhase(0);
  }, [progress]);

  const phases = ['SCANNING…', 'PARSING EMVCo TLV…', 'EXTRACTING MERCHANT DATA…'];

  return (
    <div style={{ background: '#080514', minHeight: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 38%,#1a0a34 0%,#080514 68%)' }} />

      <div style={{ position: 'relative', zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
        <button onClick={onBack} style={{
          width: 38, height: 38, borderRadius: 12, border: 'none',
          background: 'rgba(255,255,255,0.09)', backdropFilter: 'blur(8px)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M3 3l8 8M11 3l-8 8" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
        <div style={{
          padding: '6px 16px', borderRadius: 20,
          background: 'rgba(255,255,255,0.09)', backdropFilter: 'blur(8px)',
          color: 'rgba(255,255,255,0.8)', fontFamily: fontMono, fontSize: 11, letterSpacing: 0.6,
        }}>QRIS SCANNER</div>
        <div style={{ width: 38 }} />
      </div>

      {/* Fake QR backdrop */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 180, height: 180, background: '#fff', borderRadius: 8, padding: 10,
          display: 'grid', gridTemplateColumns: 'repeat(17,1fr)', gap: 1,
          transform: 'rotate(-1.5deg) perspective(400px) rotateX(5deg)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)', opacity: 0.85,
        }}>
          {Array.from({ length: 289 }).map((_, i) => {
            const v      = ((i * 6271 + i * i * 31) ^ (i * 17)) % 100;
            const corner = (i < 102 && i % 17 < 6) || (i < 102 && i % 17 > 10) || (i >= 187 && i % 17 < 6);
            return <div key={i} style={{ background: (v > 50 || corner) ? '#111' : 'transparent' }} />;
          })}
        </div>
      </div>

      {/* Reticle */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 5 }}>
        <div style={{ position: 'relative', width: 250, height: 250 }}>
          {[
            { top: 0,      left: 0,   borderTop: `3px solid ${T.teal}`, borderLeft: `3px solid ${T.teal}`,   borderTopLeftRadius: 12 },
            { top: 0,      right: 0,  borderTop: `3px solid ${T.teal}`, borderRight: `3px solid ${T.teal}`,  borderTopRightRadius: 12 },
            { bottom: 0,   left: 0,   borderBottom: `3px solid ${T.teal}`, borderLeft: `3px solid ${T.teal}`,  borderBottomLeftRadius: 12 },
            { bottom: 0,   right: 0,  borderBottom: `3px solid ${T.teal}`, borderRight: `3px solid ${T.teal}`, borderBottomRightRadius: 12 },
          ].map((s, i) => <div key={i} style={{ position: 'absolute', width: 32, height: 32, ...s }} />)}

          {progress < 100 ? (
            <div style={{
              position: 'absolute', left: 0, right: 0, top: `${8 + progress * 0.84}%`, height: 2,
              background: `linear-gradient(90deg,transparent,${T.teal},${T.primary},${T.teal},transparent)`,
              boxShadow: `0 0 18px ${T.teal}`,
            }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <circle cx="32" cy="32" r="30" fill="rgba(16,217,170,0.12)" stroke={T.teal} strokeWidth="2"/>
                <path d="M20 32l8 8 16-16" stroke={T.teal} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Status */}
      <div style={{ padding: '0 20px 36px', position: 'relative', zIndex: 5 }}>
        <div style={{
          padding: 16, borderRadius: 16,
          background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Dot color={progress >= 100 ? T.teal : T.warn} size={7} pulse={progress < 100} />
            <span style={{ fontFamily: fontMono, fontSize: 11, color: 'rgba(255,255,255,0.9)', letterSpacing: 0.5 }}>
              {phases[phase]}
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, width: `${progress}%`, background: grad, transition: 'width .1s linear' }} />
          </div>
          <div style={{ fontFamily: fontUI, fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 10 }}>
            Hold the QRIS sticker steady inside the frame.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 4: Intent ─────────────────────────────────────────────────────────
function IntentScreen({ qrType, onAuthorize, onBack, intent }) {
  const [amount, setAmount] = useState(qrType === 'static' ? '' : String(intent.idr));
  const isStatic   = qrType === 'static';
  const idr        = parseInt(amount || '0', 10);
  const usdc       = idr > 0 ? (idr / 16318).toFixed(4) : '0.0000';
  const fee        = Math.round(idr * 0.005);
  const networkFee = 12;
  const total      = idr + fee + networkFee;

  return (
    <div style={{ background: T.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <TopBar title="Confirm payment" onBack={onBack}
        right={<Chip tone={isStatic ? 'warn' : 'ok'}>{isStatic ? 'Static' : 'Dynamic'}</Chip>} />

      <div style={{ padding: '16px 18px 0' }}>
        <div style={{ fontFamily: fontUI, fontSize: 11, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Merchant</div>
        <Card style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 13, background: grad, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: fontMono, fontSize: 14, fontWeight: 700, color: '#fff',
            }}>{intent.merchantInitials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: fontUI, fontSize: 14, fontWeight: 600, color: T.ink }}>{intent.merchantName}</div>
              <div style={{ fontFamily: fontMono, fontSize: 11, color: T.ink3, marginTop: 2 }}>NMID {intent.nmid} · {intent.acquirer}</div>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ padding: '14px 18px 0' }}>
        <div style={{ fontFamily: fontUI, fontSize: 11, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Amount {isStatic && <span style={{ textTransform: 'none', fontWeight: 400 }}>· enter below</span>}
        </div>
        <Card style={{ padding: '20px 16px', textAlign: 'center' }}>
          {isStatic ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
                <span style={{ fontFamily: fontUI, fontSize: 20, color: T.ink3, fontWeight: 500 }}>Rp</span>
                <input autoFocus inputMode="numeric" value={amount}
                  onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="0"
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: fontUI, fontSize: 36, fontWeight: 700, color: T.ink, textAlign: 'center', width: 200, letterSpacing: -1 }} />
              </div>
              <div style={{ fontFamily: fontMono, fontSize: 12, color: T.ink3, marginTop: 6 }}>≈ {usdc} USDC</div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: fontUI, fontSize: 11, color: T.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>Locked by merchant</div>
              <div style={{ fontFamily: fontUI, fontSize: 36, fontWeight: 700, color: T.ink, letterSpacing: -1 }}>Rp {idr.toLocaleString('id-ID')}</div>
              <div style={{ fontFamily: fontMono, fontSize: 12, color: T.ink3, marginTop: 6 }}>≈ {usdc} USDC</div>
            </>
          )}
        </Card>
      </div>

      <div style={{ padding: '14px 18px 0' }}>
        <div style={{ fontFamily: fontUI, fontSize: 11, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Route</div>
        <Card style={{ padding: '4px 16px' }}>
          <Row label="Pay with"   value="USDC" sub="from connected wallet" />
          <Row label="Swap"       value="USDC → IDRX" sub="Jupiter Aggregator · 0.3% slippage" mono />
          <Row label="Settlement" value="IDRX → IDR · BI-FAST" last />
        </Card>
      </div>

      <div style={{ padding: '14px 18px 0' }}>
        <Card style={{ padding: '4px 16px' }}>
          <Row label="Merchant receives" value={`Rp ${idr.toLocaleString('id-ID')}`} mono />
          <Row label="Platform fee (0.5%)" value={`Rp ${fee.toLocaleString('id-ID')}`} mono />
          <Row label="Network + swap"     value={`Rp ${networkFee}`} mono sub="batched via Jito" />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 10px' }}>
            <span style={{ fontFamily: fontUI, fontSize: 15, color: T.ink, fontWeight: 700 }}>You pay</span>
            <span style={{ fontFamily: fontMono, fontSize: 16, color: T.ink, fontWeight: 700 }}>Rp {total.toLocaleString('id-ID')}</span>
          </div>
        </Card>
      </div>

      <div style={{ flex: 1, minHeight: 16 }} />

      <div style={{ padding: '14px 18px 28px' }}>
        <GradBtn onClick={() => idr > 0 && onAuthorize({ idr, totalDebit: total, usdc })} disabled={idr <= 0} size="lg">
          {idr > 0 ? `Authorize Rp ${total.toLocaleString('id-ID')}` : 'Enter amount'}
        </GradBtn>
        <div style={{ fontFamily: fontUI, fontSize: 11, color: T.ink3, textAlign: 'center', marginTop: 10 }}>
          Signed in your wallet — SOLQ never moves funds without your signature.
        </div>
      </div>
    </div>
  );
}

// ─── Auth Sheet ───────────────────────────────────────────────────────────────
function AuthSheet({ onSign, onReject, intent }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(13,6,32,0.65)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'flex-end', zIndex: 20,
      animation: 'solq-fade .2s ease',
    }}>
      <div style={{
        width: '100%', background: T.bg,
        borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '8px 0 28px',
        animation: 'solq-slide-up .26s cubic-bezier(.22,.9,.3,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 18px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.line }} />
        </div>
        <div style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 13, background: grad, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 1L1.5 4.5v5C1.5 13.5 4.7 17 9 18c4.3-1 7.5-4.5 7.5-8.5v-5L9 1Z" stroke="white" strokeWidth="1.4"/>
                <path d="M6 9l2.5 2.5 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: fontUI, fontSize: 14, fontWeight: 600, color: T.ink }}>Wallet authorization</div>
              <div style={{ fontFamily: fontUI, fontSize: 12, color: T.ink3 }}>Review before signing</div>
            </div>
          </div>

          <Card style={{ padding: '4px 14px', marginBottom: 14 }}>
            <Row label="Send"         value={`${intent.usdc} USDC`} mono />
            <Row label="Token"        value="EPjFW…UjL" mono sub="USDC mainnet-beta" />
            <Row label="To"           value="Jupiter aggregator" sub="route → IDRX" />
            <Row label="Network fee"  value="~0.000018 SOL" mono />
            <Row label="Intent hash"  value="0x9a4f…b21c" mono last />
          </Card>

          <div style={{
            padding: '10px 12px', borderRadius: 12, background: T.warnSoft,
            fontFamily: fontUI, fontSize: 12, color: T.warnFg, lineHeight: 1.5, marginBottom: 18,
          }}>
            Only sign if the merchant and amount match what you scanned. Signed Solana transactions are irreversible.
          </div>
        </div>

        <div style={{ padding: '0 20px', display: 'flex', gap: 10 }}>
          <button onClick={onReject} style={{
            flex: 1, padding: '14px', borderRadius: 14,
            background: T.bg, color: T.ink, border: `1.5px solid ${T.line}`,
            fontFamily: fontUI, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Reject</button>
          <button onClick={onSign} style={{
            flex: 1, padding: '14px', borderRadius: 14,
            background: grad, color: '#fff', border: 'none',
            fontFamily: fontUI, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 4px 18px rgba(147,51,234,0.38)',
          }}>Sign</button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 5: Settling ───────────────────────────────────────────────────────
function SettlingScreen({ onComplete, intent }) {
  const stages = [
    { key: 'AUTHORIZED', label: 'Signature received',    sub: 'Wallet approved the transaction',         t: 600  },
    { key: 'SWAPPING',   label: 'Swapping USDC → IDRX', sub: 'Jupiter Aggregator · 0.3% slippage max',  t: 1400 },
    { key: 'SETTLING',   label: 'Settling to QRIS rail', sub: 'Licensed partner · BI-FAST disbursement', t: 1600 },
    { key: 'COMPLETED',  label: 'Merchant credited',     sub: 'Rupiah received in bank account',         t: 500  },
  ];
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (current < stages.length) {
      const t = setTimeout(() => setCurrent(c => c + 1), stages[current].t);
      return () => clearTimeout(t);
    }
    const t = setTimeout(onComplete, 600);
    return () => clearTimeout(t);
  }, [current]);

  return (
    <div style={{ background: T.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar title="Settlement" />
      <div style={{ padding: '28px 20px 0', textAlign: 'center' }}>
        <div style={{ fontFamily: fontUI, fontSize: 11, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Paying</div>
        <div style={{ fontFamily: fontUI, fontSize: 34, fontWeight: 700, color: T.ink, letterSpacing: -1, marginTop: 6 }}>
          Rp {intent.idr.toLocaleString('id-ID')}
        </div>
        <div style={{ fontFamily: fontMono, fontSize: 12, color: T.ink3, marginTop: 6 }}>{intent.usdc} USDC · Solana mainnet</div>
      </div>

      <div style={{ padding: '36px 20px 0' }}>
        {stages.map((s, i) => {
          const done   = i < current;
          const active = i === current;
          return (
            <div key={s.key} style={{ display: 'flex', gap: 14, paddingBottom: i < stages.length - 1 ? 22 : 0, position: 'relative' }}>
              {i < stages.length - 1 && (
                <div style={{
                  position: 'absolute', left: 11, top: 24, width: 2, bottom: -4,
                  background: done ? grad : T.line, transition: 'background 0.6s',
                }} />
              )}
              <div style={{
                width: 24, height: 24, borderRadius: 12, flexShrink: 0,
                background: done ? T.teal : T.bg,
                border: `2px solid ${done ? T.teal : active ? T.primary : T.line}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', zIndex: 1,
                boxShadow: active ? `0 0 0 4px ${T.primarySoft}` : 'none',
                transition: 'all 0.3s',
              }}>
                {done ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : active ? <Dot color={T.primary} size={7} pulse /> : null}
              </div>
              <div style={{ flex: 1, paddingTop: 1 }}>
                <div style={{ fontFamily: fontUI, fontSize: 14, fontWeight: 500, color: done || active ? T.ink : T.ink3 }}>{s.label}</div>
                <div style={{ fontFamily: fontUI, fontSize: 12, color: T.ink3, marginTop: 2 }}>{s.sub}</div>
                {active && <div style={{ fontFamily: fontMono, fontSize: 10, color: T.primary, marginTop: 6, letterSpacing: 0.3 }}>STATE · {s.key}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ padding: '20px 20px 28px' }}>
        <div style={{ padding: 14, borderRadius: 14, background: T.primarySoft, fontFamily: fontUI, fontSize: 12, color: T.primaryDark, lineHeight: 1.5 }}>
          SOLQ never holds your funds. Each stage advances only on real on-chain or partner confirmation.
        </div>
      </div>
    </div>
  );
}

// ─── Screen 6: Receipt ────────────────────────────────────────────────────────
function ReceiptScreen({ onDone, intent }) {
  return (
    <div style={{ background: T.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <TopBar title="Receipt" />
      <div style={{ padding: '28px 20px 0', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20, margin: '0 auto 16px',
          background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(16,217,170,0.3)',
        }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M6 14l5.5 5.5 10.5-10.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontFamily: fontUI, fontSize: 11, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Merchant credited</div>
        <div style={{ fontFamily: fontUI, fontSize: 34, fontWeight: 700, color: T.ink, letterSpacing: -1, marginTop: 6 }}>
          Rp {intent.idr.toLocaleString('id-ID')}
        </div>
        <div style={{ fontFamily: fontUI, fontSize: 13, color: T.ink3, marginTop: 4 }}>to {intent.merchantName}</div>
      </div>

      <div style={{ padding: '24px 18px 0' }}>
        <Card style={{ padding: '4px 16px' }}>
          <Row label="Status"       value={<span style={{ display:'inline-flex',alignItems:'center',gap:6 }}><Dot color={T.ok} size={6} />COMPLETED</span>} />
          <Row label="Paid"         value={`${intent.usdc} USDC`} mono />
          <Row label="Received"     value={`Rp ${intent.idr.toLocaleString('id-ID')}`} mono />
          <Row label="Platform fee" value="Rp 237" mono />
          <Row label="Acquirer"     value={intent.acquirer} />
          <Row label="NMID"         value={intent.nmid} mono />
          <Row label="Time"         value="Apr 27, 2026 · 14:32 WIB" last />
        </Card>
      </div>

      <div style={{ padding: '16px 18px 0' }}>
        <div style={{ fontFamily: fontUI, fontSize: 11, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>On-chain proof</div>
        <Card style={{ padding: 14 }}>
          <div style={{ fontFamily: fontMono, fontSize: 11, color: T.ink, wordBreak: 'break-all', lineHeight: 1.6 }}>
            5KkJP9xQwVz7r3mNbT4uYf2hAcGd8XeR6sLpW1nVtBkH9oM2yE3aZqUcF7iJrX
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${T.line}`, background: T.bg, fontFamily: fontUI, fontSize: 12, color: T.ink, cursor: 'pointer' }}>Solana Explorer</button>
            <button style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${T.line}`, background: T.bg, fontFamily: fontUI, fontSize: 12, color: T.ink, cursor: 'pointer' }}>Copy hash</button>
          </div>
        </Card>
      </div>

      <div style={{ flex: 1 }} />
      <div style={{ padding: '16px 18px 28px' }}>
        <GradBtn onClick={onDone} size="lg">Done</GradBtn>
      </div>
    </div>
  );
}

// ─── Screen 7: History ────────────────────────────────────────────────────────
function HistoryScreen({ onBack, onOpen }) {
  const items = [
    { id: 1, name: 'Warung Kopi Senopati',   time: 'Today · 14:32', amount: 47500,  status: 'completed', token: 'USDC' },
    { id: 2, name: 'Toko Kelontong Bu Sari', time: 'Today · 09:11', amount: 28000,  status: 'completed', token: 'USDC' },
    { id: 3, name: 'Bakso Cak Hadi',         time: 'Yesterday',     amount: 35000,  status: 'completed', token: 'SOL'  },
    { id: 4, name: 'Apotek Sehat',           time: 'Yesterday',     amount: 124000, status: 'completed', token: 'USDC' },
    { id: 5, name: 'Laundry Express',        time: '2d ago',        amount: 60000,  status: 'failed',    token: 'USDC' },
    { id: 6, name: 'Indomaret',              time: '3d ago',        amount: 87500,  status: 'completed', token: 'USDC' },
  ];

  return (
    <div style={{ background: T.bg, minHeight: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <TopBar title="Activity" onBack={onBack} />

      <div style={{ padding: '18px 18px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Card style={{ padding: 14 }}>
          <div style={{ fontFamily: fontUI, fontSize: 10, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Volume · 30d</div>
          <div style={{ fontFamily: fontUI, fontSize: 22, fontWeight: 700, color: T.ink, marginTop: 4, letterSpacing: -0.6 }}>Rp 4.2M</div>
          <div style={{ fontFamily: fontMono, fontSize: 11, color: T.ink3, marginTop: 2 }}>27 payments</div>
        </Card>
        <Card style={{ padding: 14 }}>
          <div style={{ fontFamily: fontUI, fontSize: 10, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Saved vs card</div>
          <div style={{ fontFamily: fontUI, fontSize: 22, fontWeight: 700, color: T.ink, marginTop: 4, letterSpacing: -0.6 }}>Rp 88,400</div>
          <div style={{ fontFamily: fontMono, fontSize: 11, color: T.teal, marginTop: 2 }}>~2.1% lower fees</div>
        </Card>
      </div>

      <div style={{ padding: '18px 18px 0' }}>
        <div style={{ fontFamily: fontUI, fontSize: 11, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Payments</div>
        <Card>
          {items.map((it, i) => (
            <button key={it.id} onClick={onOpen} style={{
              width: '100%', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
              border: 'none', borderBottom: i < items.length - 1 ? `1px solid ${T.line}` : 'none',
              background: T.card, cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: it.status === 'completed' ? T.primarySoft : T.errSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: fontMono, fontSize: 12, fontWeight: 700,
                color: it.status === 'completed' ? T.primary : T.err,
              }}>{it.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: fontUI, fontSize: 13, fontWeight: 500, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                <div style={{ fontFamily: fontUI, fontSize: 11, color: T.ink3, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Dot color={it.status === 'completed' ? T.ok : T.err} size={5} />
                  {it.time} · {it.token}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: fontMono, fontSize: 13, fontWeight: 600, color: T.ink }}>Rp {it.amount.toLocaleString('id-ID')}</div>
                <div style={{ fontFamily: fontUI, fontSize: 10, color: it.status === 'completed' ? T.ok : T.err, marginTop: 2, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.3 }}>{it.status}</div>
              </div>
            </button>
          ))}
        </Card>
      </div>
      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────
function TabBar({ active, onChange, t: tOverride }) {
  const tT = tOverride || T;
  const activeColor = tT.primary || T.primary;
  const tabs = [
    { id: 'home',     label: 'Pay',
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><rect x="12" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><rect x="2" y="12" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><path d="M12 12h3v3h-3zM18 12v6M15 18h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> },
    { id: 'history',  label: 'Activity',
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> },
    { id: 'settings', label: 'Settings',
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.1 4.1l1.4 1.4M14.5 14.5l1.4 1.4M4.1 15.9l1.4-1.4M14.5 5.5l1.4-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> },
  ];
  return (
    <div style={{ borderTop: `1px solid ${tT.line}`, background: tT.bg, padding: '6px 8px 10px', display: 'flex' }}>
      {tabs.map(tab => {
        const on = active === tab.id;
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)} style={{
            flex: 1, padding: '8px 4px', border: 'none', background: 'transparent',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color: on ? activeColor : tT.ink3, cursor: 'pointer',
          }}>
            {tab.icon}
            <span style={{ fontFamily: fontUI, fontSize: 10, fontWeight: on ? 700 : 500, letterSpacing: 0.2 }}>{tab.label}</span>
            {on && <div style={{ width: 4, height: 4, borderRadius: 2, background: grad }} />}
          </button>
        );
      })}
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────
function SolqApp({ initialScreen = 'connect', initialQrType = 'dynamic', initialDark = false }) {
  const [screen,   setScreen]   = useState(initialScreen);
  const [qrType,   setQrType]   = useState(initialQrType);
  const [showAuth, setShowAuth] = useState(false);
  const [dark,     setDark]     = useState(initialDark);
  const [profile,  setProfile]  = useState({
    initials: 'AR', handle: 'arif.id', displayName: 'Arif Rahman', email: 'arif@example.com',
  });

  const themeT = (window.themes && window.themes[dark ? 'dark' : 'light']) || T;

  const [intent, setIntent] = useState({
    merchantName: 'Warung Kopi Senopati', merchantInitials: 'WK',
    nmid: 'ID1024 0000 5582 791', acquirer: 'GoPay Merchant',
    idr: 47500, usdc: '2.9105',
  });

  const wallet = { address: '7xKXaB3m…9PvR', sol: '4.218', usdc: '142.50' };

  const handleDecode = type => {
    setIntent(prev => ({
      ...prev,
      merchantName:     type === 'static' ? 'Toko Kelontong Bu Sari' : 'Warung Kopi Senopati',
      merchantInitials: type === 'static' ? 'TK' : 'WK',
      acquirer:         type === 'static' ? 'BCA QRIS' : 'GoPay Merchant',
      idr:              type === 'static' ? 0 : 47500,
    }));
    setQrType(type);
    setScreen('intent');
  };

  const tabScreens = ['home', 'history', 'settings'];

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: themeT.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {screen === 'connect'  && <ConnectScreen onConnect={() => setScreen('home')} />}
        {screen === 'home'     && <HomeScreen wallet={wallet} onScan={() => setScreen('scan')} onHistory={() => setScreen('history')} />}
        {screen === 'scan'     && <ScanScreen qrType={qrType} onDecode={handleDecode} onBack={() => setScreen('home')} />}
        {screen === 'intent'   && <IntentScreen qrType={qrType} intent={intent} onBack={() => setScreen('scan')} onAuthorize={data => { setIntent(p => ({ ...p, ...data })); setShowAuth(true); }} />}
        {screen === 'settling' && <SettlingScreen intent={intent} onComplete={() => setScreen('receipt')} />}
        {screen === 'receipt'  && <ReceiptScreen intent={intent} onDone={() => setScreen('home')} />}
        {screen === 'history'  && <HistoryScreen onBack={() => setScreen('home')} onOpen={() => setScreen('receipt')} />}
        {screen === 'settings' && window.SettingsRouter && (
          <SettingsRouter onBack={() => setScreen('home')} t={themeT} dark={dark} setDark={setDark} profile={profile} setProfile={setProfile} wallet={wallet} />
        )}
        {showAuth && (
          <AuthSheet intent={intent} onReject={() => setShowAuth(false)} onSign={() => { setShowAuth(false); setScreen('settling'); }} />
        )}
      </div>
      {tabScreens.includes(screen) && (
        <TabBar active={screen} onChange={id => setScreen(id)} t={themeT} />
      )}
    </div>
  );
}

Object.assign(window, {
  SolqApp, SolqQ, T, grad,
  ConnectScreen, HomeScreen, ScanScreen, IntentScreen, AuthSheet,
  SettlingScreen, ReceiptScreen, HistoryScreen, TabBar,
  GradBtn, Chip, Dot, Row, TopBar, Card,
});
