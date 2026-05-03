// SOLQ Settings — comprehensive settings module
// Stays inside the non-custodial Solana × QRIS concept: keys, network, slippage,
// QRIS preferences, KYC tier (coming soon), session/security, notifications, language.

const { useState: useStateS, useEffect: useEffectS } = React;

// ============ Theme tokens (light + dark) ============
const themes = {
  light: {
    bg: '#FAFAFE', ink: '#0D0620', ink2: '#2D1B4E', ink3: '#7B6E9A',
    line: '#E8E0F8', card: '#FFFFFF', cardAlt: '#F2EEF9',
    primary: '#8B2EE8', primaryDark: '#6B1FD9', primarySoft: '#F0E5FD',
    teal: '#10D9AA', tealSoft: '#E0F9F3', tealFg: '#0A7A5F',
    ok: '#10D9AA', okSoft: '#E0F9F3', okFg: '#0A7A5F',
    warn: '#F59E0B', warnSoft: '#FEF3C7', warnFg: '#92400E',
    err: '#EF4444', errSoft: '#FEE2E2', errFg: '#991B1B',
  },
  dark: {
    bg: '#080514', ink: '#EDE9F9', ink2: '#BEB4DC', ink3: '#6B5F8A',
    line: '#1E1535', card: '#0F0A1E', cardAlt: '#160E2B',
    primary: '#A855F7', primaryDark: '#9333EA', primarySoft: '#2D1455',
    teal: '#10D9AA', tealSoft: '#0A2E25', tealFg: '#4EEDC4',
    ok: '#10D9AA', okSoft: '#0A2E25', okFg: '#4EEDC4',
    warn: '#FBB040', warnSoft: '#3D2800', warnFg: '#FCD28A',
    err: '#F87171', errSoft: '#3B0A0A', errFg: '#FCA5A5',
  },
};

const uiFont = `'Inter', -apple-system, system-ui, sans-serif`;
const monoFont = `'JetBrains Mono', ui-monospace, monospace`;

// ============ Settings shell ============
function SettingsHeader({ title, onBack, dark, t, right, large }) {
  return (
    <div style={{
      padding: large ? '16px 20px 4px' : '12px 20px 14px',
      borderBottom: large ? 'none' : `1px solid ${t.line}`, background: t.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ width: 32 }}>
        {onBack && (
          <button onClick={onBack} style={{
            width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.line}`,
            background: t.bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7l5 5" stroke={t.ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
      </div>
      <div style={{ fontFamily: uiFont, fontSize: 14, fontWeight: 600, color: t.ink, letterSpacing: -0.2 }}>{title}</div>
      <div style={{ width: 32, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </div>
  );
}

function Group({ title, hint, children, t }) {
  return (
    <div style={{ padding: '18px 20px 0' }}>
      {title && <div style={{
        fontFamily: uiFont, fontSize: 11, color: t.ink3, textTransform: 'uppercase',
        letterSpacing: 0.5, marginBottom: 8, paddingLeft: 2,
      }}>{title}</div>}
      <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, overflow: 'hidden' }}>
        {children}
      </div>
      {hint && <div style={{
        fontFamily: uiFont, fontSize: 11, color: t.ink3, marginTop: 8, paddingLeft: 2, lineHeight: 1.5,
      }}>{hint}</div>}
    </div>
  );
}

function Item({ icon, label, sub, value, onClick, danger, last, t, badge, mono }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12,
      border: 'none', borderBottom: last ? 'none' : `1px solid ${t.line}`,
      background: t.card, cursor: onClick ? 'pointer' : 'default', textAlign: 'left',
    }}>
      {icon && (
        <div style={{
          width: 28, height: 28, borderRadius: 7, background: t.cardAlt,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{icon}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: uiFont, fontSize: 14, fontWeight: 500,
          color: danger ? t.err : t.ink,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {label}
          {badge && (
            <span style={{
              fontFamily: monoFont, fontSize: 9, fontWeight: 600,
              padding: '2px 6px', borderRadius: 4,
              background: t.warnSoft, color: t.warnFg, letterSpacing: 0.4,
            }}>{badge}</span>
          )}
        </div>
        {sub && <div style={{ fontFamily: mono ? monoFont : uiFont, fontSize: 11, color: t.ink3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {value && (
          <span style={{ fontFamily: mono ? monoFont : uiFont, fontSize: 12, color: t.ink3 }}>{value}</span>
        )}
        {onClick && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2l4 4-4 4" stroke={t.ink3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
    </button>
  );
}

function Toggle({ on, onChange, t }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 40, height: 24, borderRadius: 12, border: 'none',
      background: on ? (t.primary || t.ok) : t.cardAlt,
      position: 'relative', cursor: 'pointer', transition: 'background .18s ease',
      padding: 0,
    }}>
      <div style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 20, height: 20, borderRadius: 10, background: '#fff',
        transition: 'left .18s cubic-bezier(.4,0,.2,1)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

function ToggleItem({ icon, label, sub, on, onChange, last, t }) {
  return (
    <div style={{
      width: '100%', padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12,
      borderBottom: last ? 'none' : `1px solid ${t.line}`, background: t.card,
    }}>
      {icon && (
        <div style={{
          width: 28, height: 28, borderRadius: 7, background: t.cardAlt,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{icon}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: uiFont, fontSize: 14, fontWeight: 500, color: t.ink }}>{label}</div>
        {sub && <div style={{ fontFamily: uiFont, fontSize: 11, color: t.ink3, marginTop: 2 }}>{sub}</div>}
      </div>
      <Toggle on={on} onChange={onChange} t={t} />
    </div>
  );
}

// Tiny SVG icon set — outlined, monoline
const Icon = ({ name, t }) => {
  const c = t.ink;
  const s = { width: 14, height: 14, fill: 'none', stroke: c, strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const map = {
    user: <svg viewBox="0 0 14 14" {...s}><circle cx="7" cy="4.5" r="2.2"/><path d="M2 12c.5-2.5 2.6-3.8 5-3.8s4.5 1.3 5 3.8"/></svg>,
    shield: <svg viewBox="0 0 14 14" {...s}><path d="M7 1L2 3v4c0 3 2 5.5 5 6 3-.5 5-3 5-6V3L7 1z"/></svg>,
    bell: <svg viewBox="0 0 14 14" {...s}><path d="M3 10V7a4 4 0 018 0v3l1 1H2l1-1z"/><path d="M5.5 12a1.5 1.5 0 003 0"/></svg>,
    moon: <svg viewBox="0 0 14 14" {...s}><path d="M11.5 8.5A4.5 4.5 0 015.5 2.5 5 5 0 1011.5 8.5z"/></svg>,
    globe: <svg viewBox="0 0 14 14" {...s}><circle cx="7" cy="7" r="5.5"/><path d="M1.5 7h11M7 1.5c1.5 1.7 2.3 3.5 2.3 5.5S8.5 10.8 7 12.5C5.5 10.8 4.7 9 4.7 7S5.5 3.2 7 1.5z"/></svg>,
    network: <svg viewBox="0 0 14 14" {...s}><circle cx="3" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/><circle cx="7" cy="11" r="1.5"/><path d="M3.8 4.2L6.3 9.8M10.2 4.2L7.7 9.8"/></svg>,
    wallet: <svg viewBox="0 0 14 14" {...s}><rect x="1.5" y="3" width="11" height="8.5" rx="1.5"/><path d="M9 7.5h2"/><path d="M1.5 5.5h11"/></svg>,
    key: <svg viewBox="0 0 14 14" {...s}><circle cx="4" cy="7" r="2.5"/><path d="M6.5 7H12M10 7v2M12 7V5"/></svg>,
    qr: <svg viewBox="0 0 14 14" {...s}><rect x="1.5" y="1.5" width="4" height="4"/><rect x="8.5" y="1.5" width="4" height="4"/><rect x="1.5" y="8.5" width="4" height="4"/><path d="M8.5 8.5h2v2h-2zM12.5 8.5v4M10.5 12.5h2"/></svg>,
    receipt: <svg viewBox="0 0 14 14" {...s}><path d="M2.5 1.5v11l1.5-1 1.5 1 1.5-1 1.5 1 1.5-1 1.5 1v-11z"/><path d="M5 5h4M5 7.5h4M5 10h2.5"/></svg>,
    info: <svg viewBox="0 0 14 14" {...s}><circle cx="7" cy="7" r="5.5"/><path d="M7 6v4M7 4.2v.1"/></svg>,
    help: <svg viewBox="0 0 14 14" {...s}><circle cx="7" cy="7" r="5.5"/><path d="M5.3 5.5c0-1 .8-1.7 1.7-1.7 1 0 1.7.8 1.7 1.7 0 1.5-1.7 1.5-1.7 2.7M7 10.2v.1"/></svg>,
    book: <svg viewBox="0 0 14 14" {...s}><path d="M2 2h4.5c.8 0 1.5.7 1.5 1.5V12c0-.8-.7-1.5-1.5-1.5H2zM12 2H7.5C6.7 2 6 2.7 6 3.5V12c0-.8.7-1.5 1.5-1.5H12z"/></svg>,
    bolt: <svg viewBox="0 0 14 14" {...s}><path d="M8 1.5L3 8h3l-1 4.5L10 6H7z"/></svg>,
    door: <svg viewBox="0 0 14 14" {...s}><path d="M9 2H3v10h6M9 2v10M9 2l3 1v8l-3 1M11 7v.1"/></svg>,
    trash: <svg viewBox="0 0 14 14" {...s}><path d="M2 3.5h10M5 3.5V2.5C5 2 5.5 1.5 6 1.5h2c.5 0 1 .5 1 1v1M3.5 3.5L4 12c0 .5.5 1 1 1h4c.5 0 1-.5 1-1l.5-8.5"/></svg>,
    chip: <svg viewBox="0 0 14 14" {...s}><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><path d="M5.5 5.5h3v3h-3zM3.5 5h-1.5M3.5 7h-1.5M3.5 9h-1.5M11.5 5h-1M11.5 7h-1M11.5 9h-1M5 3.5v-1M7 3.5v-1M9 3.5v-1M5 11.5v-1M7 11.5v-1M9 11.5v-1"/></svg>,
    finger: <svg viewBox="0 0 14 14" {...s}><path d="M3.5 7a3.5 3.5 0 117 0v2a2 2 0 01-2 2M5.5 7a1.5 1.5 0 113 0v2M7 5.5v3.5M9.5 4A4 4 0 003 5"/></svg>,
    download: <svg viewBox="0 0 14 14" {...s}><path d="M7 2v7M4 6l3 3 3-3M2.5 11.5h9"/></svg>,
    log: <svg viewBox="0 0 14 14" {...s}><rect x="2" y="2" width="10" height="10" rx="1"/><path d="M4.5 4.5h5M4.5 7h5M4.5 9.5h3"/></svg>,
  };
  return map[name] || null;
};

// ============ Settings Index ============
function SettingsIndex({ go, t, dark, onBack, profile, wallet }) {
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Settings" onBack={onBack} t={t} />

      {/* Profile card */}
      <div style={{ padding: '18px 20px 0' }}>
        <button onClick={() => go('profile')} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          padding: 14, borderRadius: 12, background: t.card,
          border: `1px solid ${t.line}`, cursor: 'pointer', textAlign: 'left',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, background: t.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: t.bg, fontFamily: monoFont, fontSize: 16, fontWeight: 600,
          }}>{profile.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: uiFont, fontSize: 14, fontWeight: 600, color: t.ink, letterSpacing: -0.2 }}>
              {profile.handle}
            </div>
            <div style={{ fontFamily: monoFont, fontSize: 11, color: t.ink3, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {wallet.address}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <span style={{ fontFamily: uiFont, fontSize: 10, fontWeight: 500, padding: '3px 7px', borderRadius: 5, background: t.cardAlt, color: t.ink2, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Tier 0 · Basic
              </span>
              <span style={{ fontFamily: uiFont, fontSize: 10, fontWeight: 500, padding: '3px 7px', borderRadius: 5, background: t.warnSoft, color: t.warnFg, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                KYC pending
              </span>
            </div>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2l4 4-4 4" stroke={t.ink3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <Group title="Account" t={t}>
        <Item icon={<Icon name="user" t={t} />} label="Profile" sub="Display name, avatar, handle" onClick={() => go('profile')} t={t} />
        <Item icon={<Icon name="shield" t={t} />} label="Verification (KYC)" sub="Required for limits above Rp 2,000,000/day" badge="SOON" onClick={() => go('kyc')} t={t} />
        <Item icon={<Icon name="receipt" t={t} />} label="Spending limits" sub="Daily Rp 2M · Monthly Rp 20M" onClick={() => go('limits')} t={t} last />
      </Group>

      <Group title="Wallet & Network" t={t}>
        <Item icon={<Icon name="wallet" t={t} />} label="Connected wallets" sub="1 active · MWA session" onClick={() => go('wallets')} t={t} />
        <Item icon={<Icon name="network" t={t} />} label="Solana network" value="Mainnet-Beta" onClick={() => go('network')} t={t} />
        <Item icon={<Icon name="bolt" t={t} />} label="Routing & slippage" sub="Jupiter · 0.3% max slippage" onClick={() => go('routing')} t={t} last />
      </Group>

      <Group title="Payments" t={t}>
        <Item icon={<Icon name="qr" t={t} />} label="QRIS preferences" sub="Default token, confirm threshold" onClick={() => go('qris')} t={t} />
        <Item icon={<Icon name="receipt" t={t} />} label="Receipts & invoices" sub="Tax ID, auto-export" onClick={() => go('receipts')} t={t} last />
      </Group>

      <Group title="Security" t={t}>
        <Item icon={<Icon name="finger" t={t} />} label="App lock" sub="Face ID + 6-digit PIN" onClick={() => go('lock')} t={t} />
        <Item icon={<Icon name="key" t={t} />} label="Signing sessions" sub="2 devices · 14-day rotation" onClick={() => go('sessions')} t={t} />
        <Item icon={<Icon name="log" t={t} />} label="Audit log" sub="32 events in last 30 days" onClick={() => go('audit')} t={t} last />
      </Group>

      <Group title="Appearance & Language" t={t}>
        <Item icon={<Icon name="moon" t={t} />} label="Appearance" value={dark ? 'Dark' : 'Light'} onClick={() => go('appearance')} t={t} />
        <Item icon={<Icon name="globe" t={t} />} label="Language & region" value="Bahasa · ID" onClick={() => go('language')} t={t} />
        <Item icon={<Icon name="bell" t={t} />} label="Notifications" sub="Push, email, on-chain alerts" onClick={() => go('notifs')} t={t} last />
      </Group>

      <Group title="About" t={t}>
        <Item icon={<Icon name="info" t={t} />} label="About SOLQ" sub="v 0.4.2 (build 1207)" onClick={() => go('about')} t={t} />
        <Item icon={<Icon name="book" t={t} />} label="Legal & compliance" sub="Terms, privacy, BI/OJK posture" onClick={() => go('legal')} t={t} />
        <Item icon={<Icon name="help" t={t} />} label="Help & support" sub="Docs, status, contact" onClick={() => go('help')} t={t} last />
      </Group>

      <Group t={t}>
        <Item icon={<Icon name="door" t={t} />} label="Disconnect wallet" onClick={() => go('disconnect')} t={t} danger last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
      <div style={{ padding: '20px', textAlign: 'center', fontFamily: monoFont, fontSize: 10, color: t.ink3, letterSpacing: 0.5 }}>
        SOLQ · non-custodial QRIS orchestrator
      </div>
    </div>
  );
}

// ============ Profile ============
function ProfileScreen({ onBack, t, profile, setProfile }) {
  const [handle, setHandle] = useStateS(profile.handle);
  const [display, setDisplay] = useStateS(profile.displayName);
  const [email, setEmail] = useStateS(profile.email);
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Profile" onBack={onBack} t={t} />

      <div style={{ padding: '24px 20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 18, background: t.ink, color: t.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: monoFont, fontSize: 26, fontWeight: 600,
        }}>{profile.initials}</div>
        <button style={{
          padding: '8px 14px', borderRadius: 8, border: `1px solid ${t.line}`,
          background: t.card, color: t.ink, fontFamily: uiFont, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        }}>Change avatar</button>
      </div>

      <Group title="Identity" t={t}>
        <Field label="Display name" value={display} onChange={setDisplay} t={t} />
        <Field label="Handle" value={handle} onChange={setHandle} prefix="@" t={t} />
        <Field label="Email" value={email} onChange={setEmail} t={t} sub="for receipts only · never shared" last />
      </Group>

      <Group title="Public" hint="Anyone with your handle can send to your linked Solana address." t={t}>
        <Item label="solq.id/@" value={`@${handle}`} t={t} mono last />
      </Group>

      <Group title="Address book" t={t}>
        <Item icon={<Icon name="user" t={t} />} label="Recipients" sub="3 saved · Warung Kopi, Cak Hadi, Apotek" t={t} onClick={() => {}} last />
      </Group>

      <div style={{ flex: 1, minHeight: 16 }} />
      <div style={{ padding: '16px 20px 24px' }}>
        <button onClick={onBack} style={{
          width: '100%', padding: '14px', borderRadius: 12,
          background: t.ink, color: t.bg, border: 'none',
          fontFamily: uiFont, fontSize: 14, fontWeight: 500, cursor: 'pointer',
        }}>Save changes</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, prefix, sub, last, t }) {
  return (
    <div style={{
      padding: '12px 14px', borderBottom: last ? 'none' : `1px solid ${t.line}`, background: t.card,
    }}>
      <div style={{ fontFamily: uiFont, fontSize: 11, color: t.ink3, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {prefix && <span style={{ fontFamily: uiFont, fontSize: 14, color: t.ink3 }}>{prefix}</span>}
        <input value={value} onChange={e => onChange(e.target.value)} style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          fontFamily: uiFont, fontSize: 14, color: t.ink, padding: 0,
        }} />
      </div>
      {sub && <div style={{ fontFamily: uiFont, fontSize: 11, color: t.ink3, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ============ KYC (coming soon) ============
function KycScreen({ onBack, t }) {
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Verification" onBack={onBack} t={t} />

      <div style={{ padding: '28px 24px 0', textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, background: t.warnSoft, color: t.warnFg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6l9-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M12 8v4M12 15v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </div>
        <div style={{ fontFamily: uiFont, fontSize: 11, color: t.warnFg, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
          Coming soon
        </div>
        <div style={{ fontFamily: uiFont, fontSize: 22, fontWeight: 600, color: t.ink, letterSpacing: -0.4, marginTop: 6 }}>
          Identity verification
        </div>
        <div style={{ fontFamily: uiFont, fontSize: 13, color: t.ink3, marginTop: 8, lineHeight: 1.5, textWrap: 'pretty' }}>
          KYC unlocks higher payment limits and merchant settlement. We're partnering with a licensed Indonesian PJP and will roll this out in Q3 2026.
        </div>
      </div>

      <Group title="What you'll get" t={t}>
        <Item icon={<Icon name="receipt" t={t} />} label="Tier 1 · verified" sub="Daily Rp 20M · Monthly Rp 200M" t={t} />
        <Item icon={<Icon name="bolt" t={t} />} label="Tier 2 · enhanced" sub="Daily Rp 100M · custom merchant flows" t={t} />
        <Item icon={<Icon name="receipt" t={t} />} label="Tax-ready receipts" sub="NPWP-linked invoicing · auto-export" t={t} last />
      </Group>

      <Group title="What we'll ask" hint="Data is processed by our licensed partner — never stored on SOLQ servers in raw form." t={t}>
        <Item icon={<Icon name="user" t={t} />} label="Full legal name" t={t} />
        <Item icon={<Icon name="chip" t={t} />} label="KTP or Passport scan" t={t} />
        <Item icon={<Icon name="user" t={t} />} label="Liveness selfie" t={t} />
        <Item icon={<Icon name="receipt" t={t} />} label="Bank account or NPWP (Tier 2 only)" t={t} last />
      </Group>

      <div style={{ flex: 1, minHeight: 20 }} />
      <div style={{ padding: '16px 20px 24px' }}>
        <button disabled style={{
          width: '100%', padding: '14px', borderRadius: 12,
          background: t.cardAlt, color: t.ink3, border: `1px solid ${t.line}`,
          fontFamily: uiFont, fontSize: 14, fontWeight: 500, cursor: 'not-allowed',
        }}>Notify me when available</button>
        <div style={{ fontFamily: uiFont, fontSize: 11, color: t.ink3, textAlign: 'center', marginTop: 10 }}>
          Until then, your daily limit is Rp 2,000,000.
        </div>
      </div>
    </div>
  );
}

// ============ Limits ============
function LimitsScreen({ onBack, t }) {
  const used = 312000;
  const cap = 2000000;
  const pct = Math.min(100, (used / cap) * 100);
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Spending limits" onBack={onBack} t={t} />

      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: uiFont, fontSize: 11, color: t.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Today</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
            <div style={{ fontFamily: uiFont, fontSize: 22, fontWeight: 600, color: t.ink, letterSpacing: -0.4 }}>
              Rp {used.toLocaleString('id-ID')}
            </div>
            <div style={{ fontFamily: monoFont, fontSize: 12, color: t.ink3 }}>
              / Rp {cap.toLocaleString('id-ID')}
            </div>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: t.cardAlt, marginTop: 12, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: t.ok, borderRadius: 3 }} />
          </div>
          <div style={{ fontFamily: uiFont, fontSize: 11, color: t.ink3, marginTop: 8 }}>
            Resets at 00:00 WIB
          </div>
        </div>
      </div>

      <Group title="Current tier" hint="Verify your identity to unlock higher limits." t={t}>
        <Item label="Daily" value="Rp 2,000,000" t={t} mono />
        <Item label="Monthly" value="Rp 20,000,000" t={t} mono />
        <Item label="Per transaction" value="Rp 1,000,000" t={t} mono />
        <Item label="Tier" value="0 · Basic" t={t} last />
      </Group>

      <Group title="Self-imposed caps" hint="Optional limits below the tier ceiling. Useful for shared devices or budget control." t={t}>
        <ToggleItem label="Enable daily cap" sub="Custom limit below Rp 2M" on={true} onChange={() => {}} t={t} />
        <Item label="Custom daily cap" value="Rp 500,000" onClick={() => {}} t={t} mono />
        <ToggleItem label="Require PIN above Rp 100,000" on={true} onChange={() => {}} t={t} last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ Wallets ============
function WalletsScreen({ onBack, t, wallet }) {
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Connected wallets" onBack={onBack} t={t} />

      <Group title="Active" t={t}>
        <div style={{ padding: 14, background: t.card, borderBottom: `1px solid ${t.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, background: t.cardAlt,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: monoFont, fontSize: 13, color: t.ink, fontWeight: 600,
            }}>P</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: uiFont, fontSize: 14, fontWeight: 500, color: t.ink }}>
                Phantom-style wallet
              </div>
              <div style={{ fontFamily: monoFont, fontSize: 11, color: t.ink3, marginTop: 2 }}>
                Connected via MWA · 2h ago
              </div>
            </div>
            <span style={{
              fontFamily: uiFont, fontSize: 10, padding: '3px 7px', borderRadius: 5,
              background: t.okSoft, color: t.okFg, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
            }}>Active</span>
          </div>
          <div style={{ background: t.cardAlt, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontFamily: uiFont, fontSize: 10, color: t.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Public key</div>
            <div style={{ fontFamily: monoFont, fontSize: 11, color: t.ink, wordBreak: 'break-all', lineHeight: 1.4 }}>
              {wallet.address}
            </div>
          </div>
        </div>
        <Item label="Disconnect this wallet" t={t} onClick={() => {}} danger last />
      </Group>

      <Group title="Auto-reconnect" t={t}>
        <ToggleItem label="Reconnect on app open" sub="Skip the wallet picker if last session is valid" on={true} onChange={() => {}} t={t} last />
      </Group>

      <Group title="Add another" t={t}>
        <Item icon={<Icon name="wallet" t={t} />} label="Connect another wallet" sub="Phantom · Solflare · Backpack · MWA" onClick={() => {}} t={t} last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ Network ============
function NetworkScreen({ onBack, t }) {
  const [net, setNet] = useStateS('mainnet');
  const nets = [
    { id: 'mainnet', label: 'Mainnet-Beta', sub: 'Production · real funds' },
    { id: 'devnet', label: 'Devnet', sub: 'Test funds · airdrop available' },
    { id: 'custom', label: 'Custom RPC', sub: 'Bring your own endpoint' },
  ];
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Solana network" onBack={onBack} t={t} />

      <Group title="Cluster" t={t}>
        {nets.map((n, i) => (
          <button key={n.id} onClick={() => setNet(n.id)} style={{
            width: '100%', padding: '14px', display: 'flex', alignItems: 'center', gap: 12,
            border: 'none', borderBottom: i < nets.length - 1 ? `1px solid ${t.line}` : 'none',
            background: t.card, cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: 9,
              border: `1.5px solid ${net === n.id ? t.ink : t.line}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {net === n.id && <div style={{ width: 9, height: 9, borderRadius: 5, background: t.ink }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: uiFont, fontSize: 14, fontWeight: 500, color: t.ink }}>{n.label}</div>
              <div style={{ fontFamily: uiFont, fontSize: 11, color: t.ink3, marginTop: 2 }}>{n.sub}</div>
            </div>
          </button>
        ))}
      </Group>

      <Group title="RPC endpoint" t={t}>
        <Item label="Provider" value="Helius" t={t} onClick={() => {}} />
        <Item label="Endpoint" value="…helius.xyz/v1" t={t} mono onClick={() => {}} />
        <Item label="Latency" value="68 ms" t={t} mono last />
      </Group>

      <Group title="Priority fees" hint="Higher priority = faster inclusion. SOLQ batches via Jito to keep this near-zero." t={t}>
        <Item label="Strategy" value="Auto · Jito" t={t} onClick={() => {}} last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ Routing & slippage ============
function RoutingScreen({ onBack, t }) {
  const [slip, setSlip] = useStateS(30); // bps = 0.3%
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Routing & slippage" onBack={onBack} t={t} />

      <Group title="Aggregator" t={t}>
        <Item label="Provider" value="Jupiter v6" t={t} onClick={() => {}} />
        <Item label="Routing mode" value="Best price" t={t} onClick={() => {}} last />
      </Group>

      <Group title="Slippage tolerance" hint="Maximum price movement allowed during the swap. Lower = stricter, more failures. Higher = more tolerant, worse fills." t={t}>
        <div style={{ padding: 16, background: t.card }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span style={{ fontFamily: uiFont, fontSize: 11, color: t.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current</span>
            <span style={{ fontFamily: monoFont, fontSize: 18, fontWeight: 600, color: t.ink }}>{(slip / 100).toFixed(2)}%</span>
          </div>
          <input type="range" min="10" max="200" step="10" value={slip} onChange={e => setSlip(Number(e.target.value))}
            style={{ width: '100%', accentColor: t.ink }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: monoFont, fontSize: 10, color: t.ink3, marginTop: 6 }}>
            <span>0.10%</span><span>1.00%</span><span>2.00%</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {[10, 30, 50, 100].map(v => (
              <button key={v} onClick={() => setSlip(v)} style={{
                flex: 1, padding: '8px', borderRadius: 8,
                border: `1px solid ${slip === v ? t.ink : t.line}`,
                background: slip === v ? t.ink : t.card,
                color: slip === v ? t.bg : t.ink,
                fontFamily: monoFont, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}>{(v / 100).toFixed(2)}%</button>
            ))}
          </div>
        </div>
      </Group>

      <Group title="Failure handling" t={t}>
        <ToggleItem label="Auto-retry on slippage" sub="Up to 2 retries with widened tolerance" on={true} onChange={() => {}} t={t} />
        <ToggleItem label="MEV protection" sub="Route through Jito bundles" on={true} onChange={() => {}} t={t} last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ QRIS preferences ============
function QrisScreen({ onBack, t }) {
  const [token, setToken] = useStateS('USDC');
  const tokens = ['USDC', 'USDT', 'SOL'];
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="QRIS preferences" onBack={onBack} t={t} />

      <Group title="Default payment token" hint="The token SOLQ debits when you scan. You can override per payment." t={t}>
        {tokens.map((tk, i) => (
          <button key={tk} onClick={() => setToken(tk)} style={{
            width: '100%', padding: '14px', display: 'flex', alignItems: 'center', gap: 12,
            border: 'none', borderBottom: i < tokens.length - 1 ? `1px solid ${t.line}` : 'none',
            background: t.card, cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: 9,
              border: `1.5px solid ${token === tk ? t.ink : t.line}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {token === tk && <div style={{ width: 9, height: 9, borderRadius: 5, background: t.ink }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: uiFont, fontSize: 14, fontWeight: 500, color: t.ink }}>{tk}</div>
              <div style={{ fontFamily: monoFont, fontSize: 11, color: t.ink3, marginTop: 2 }}>
                {tk === 'USDC' && 'EPjFW…UjL · stable, lowest fee'}
                {tk === 'USDT' && 'Es9vM…BWv · stable'}
                {tk === 'SOL' && 'Native · price-volatile'}
              </div>
            </div>
            {tk === 'USDC' && (
              <span style={{ fontFamily: uiFont, fontSize: 9, padding: '3px 6px', borderRadius: 4, background: t.okSoft, color: t.okFg, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Recommended
              </span>
            )}
          </button>
        ))}
      </Group>

      <Group title="Confirmation" t={t}>
        <ToggleItem label="Always confirm before signing" sub="Show intent screen even for small amounts" on={true} onChange={() => {}} t={t} />
        <Item label="Skip-confirm threshold" value="Off" sub="Sign immediately below this amount" t={t} onClick={() => {}} />
        <ToggleItem label="Speak amount aloud" sub="Audio confirmation in noisy environments" on={false} onChange={() => {}} t={t} last />
      </Group>

      <Group title="Static QRIS" hint="Static stickers don't carry an amount. SOLQ asks you to enter one." t={t}>
        <Item label="Last 5 amounts" value="quick-select" t={t} onClick={() => {}} />
        <ToggleItem label="Round-up to nearest 1,000" on={false} onChange={() => {}} t={t} last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ Receipts ============
function ReceiptsScreen({ onBack, t }) {
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Receipts & invoices" onBack={onBack} t={t} />

      <Group title="Tax identifier" hint="Optional. Add NPWP to embed on receipts for business expense reports." t={t}>
        <Item label="NPWP" value="Not set" onClick={() => {}} t={t} last />
      </Group>

      <Group title="Auto-export" t={t}>
        <ToggleItem label="Email receipts" sub="Send a PDF after each completed payment" on={true} onChange={() => {}} t={t} />
        <ToggleItem label="Monthly statement" sub="CSV + on-chain hashes, 1st of every month" on={true} onChange={() => {}} t={t} />
        <Item label="Format" value="PDF · CSV" onClick={() => {}} t={t} last />
      </Group>

      <Group title="Bulk export" t={t}>
        <Item icon={<Icon name="download" t={t} />} label="Export 30 days" sub="27 payments · Rp 4.2M" onClick={() => {}} t={t} />
        <Item icon={<Icon name="download" t={t} />} label="Export this year" sub="184 payments" onClick={() => {}} t={t} last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ App lock / Security ============
function LockScreen({ onBack, t }) {
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="App lock" onBack={onBack} t={t} />

      <Group title="Unlock methods" t={t}>
        <ToggleItem icon={<Icon name="finger" t={t} />} label="Face ID" sub="Unlock app and authorize signatures" on={true} onChange={() => {}} t={t} />
        <ToggleItem icon={<Icon name="key" t={t} />} label="6-digit PIN" sub="Fallback for when biometrics fail" on={true} onChange={() => {}} t={t} />
        <Item label="Change PIN" t={t} onClick={() => {}} last />
      </Group>

      <Group title="When to lock" t={t}>
        <Item label="Auto-lock after" value="5 min" t={t} onClick={() => {}} />
        <ToggleItem label="Lock on background" sub="Lock immediately when app loses focus" on={true} onChange={() => {}} t={t} />
        <ToggleItem label="Hide screen in app switcher" sub="Show a privacy splash instead of last screen" on={true} onChange={() => {}} t={t} last />
      </Group>

      <Group title="Signing prompts" hint="SOLQ never auto-signs. Each payment requires explicit authorization." t={t}>
        <ToggleItem label="Require biometric for every signature" on={true} onChange={() => {}} t={t} last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ Sessions ============
function SessionsScreen({ onBack, t }) {
  const sessions = [
    { name: 'iPhone 15 · this device', loc: 'Jakarta, ID', last: 'Active now', current: true },
    { name: 'iPad Air', loc: 'Jakarta, ID', last: '2d ago', current: false },
  ];
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Signing sessions" onBack={onBack} t={t} />

      <div style={{ padding: '18px 20px 0', fontFamily: uiFont, fontSize: 12, color: t.ink3, lineHeight: 1.5 }}>
        These devices have an active wallet session and can request signatures. Revoke any you don't recognize.
      </div>

      <Group title="Devices" t={t}>
        {sessions.map((s, i) => (
          <div key={i} style={{
            padding: 14, background: t.card,
            borderBottom: i < sessions.length - 1 ? `1px solid ${t.line}` : 'none',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: t.cardAlt,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="chip" t={t} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: uiFont, fontSize: 13, fontWeight: 500, color: t.ink }}>{s.name}</div>
              <div style={{ fontFamily: uiFont, fontSize: 11, color: t.ink3, marginTop: 2 }}>{s.loc} · {s.last}</div>
            </div>
            {s.current ? (
              <span style={{ fontFamily: uiFont, fontSize: 9, padding: '3px 6px', borderRadius: 4, background: t.okSoft, color: t.okFg, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>This device</span>
            ) : (
              <button style={{
                fontFamily: uiFont, fontSize: 11, padding: '6px 10px', borderRadius: 6,
                border: `1px solid ${t.line}`, background: t.bg, color: t.err, cursor: 'pointer', fontWeight: 500,
              }}>Revoke</button>
            )}
          </div>
        ))}
      </Group>

      <Group title="Rotation" t={t}>
        <Item label="Auto-rotate every" value="14 days" t={t} onClick={() => {}} />
        <Item label="Revoke all other sessions" t={t} onClick={() => {}} danger last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ Audit log ============
function AuditScreen({ onBack, t }) {
  const events = [
    { type: 'PAY', label: 'Payment authorized', sub: 'Warung Kopi Senopati · 47,500', time: '14:32', day: 'Today' },
    { type: 'CFG', label: 'Slippage changed', sub: '0.50% → 0.30%', time: '11:08', day: 'Today' },
    { type: 'SES', label: 'iPad session revoked', sub: 'Manual revoke', time: '09:42', day: 'Today' },
    { type: 'PAY', label: 'Payment authorized', sub: 'Toko Kelontong Bu Sari · 28,000', time: '09:11', day: 'Today' },
    { type: 'NET', label: 'RPC switched', sub: 'Triton → Helius', time: '18:24', day: 'Yesterday' },
    { type: 'AUTH', label: 'Wallet connected', sub: 'Phantom-style · MWA', time: '17:01', day: 'Yesterday' },
  ];
  const tones = { PAY: t.ok, CFG: t.ink2, SES: t.warn, NET: t.ink2, AUTH: t.ok };
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Audit log" onBack={onBack} t={t} right={
        <button style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.line}`, background: t.bg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="download" t={t} />
        </button>
      }/>

      <div style={{ padding: '18px 20px 0', fontFamily: uiFont, fontSize: 12, color: t.ink3, lineHeight: 1.5 }}>
        Every signature, configuration change, and session event. Stored locally and signed for tamper-evidence.
      </div>

      <Group t={t}>
        {events.map((e, i) => (
          <div key={i} style={{
            padding: '14px', background: t.card,
            borderBottom: i < events.length - 1 ? `1px solid ${t.line}` : 'none',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              fontFamily: monoFont, fontSize: 9, fontWeight: 600,
              padding: '3px 6px', borderRadius: 4,
              background: t.cardAlt, color: tones[e.type] || t.ink2, letterSpacing: 0.5,
              minWidth: 38, textAlign: 'center',
            }}>{e.type}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: uiFont, fontSize: 13, fontWeight: 500, color: t.ink }}>{e.label}</div>
              <div style={{ fontFamily: uiFont, fontSize: 11, color: t.ink3, marginTop: 2 }}>{e.sub}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: monoFont, fontSize: 11, color: t.ink2 }}>{e.time}</div>
              <div style={{ fontFamily: uiFont, fontSize: 10, color: t.ink3, marginTop: 2 }}>{e.day}</div>
            </div>
          </div>
        ))}
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ Appearance ============
function AppearanceScreen({ onBack, t, dark, setDark }) {
  const [mode, setMode] = useStateS(dark ? 'dark' : 'light');
  useEffectS(() => { setDark(mode === 'dark'); }, [mode]);
  const modes = [
    { id: 'light', label: 'Light', sub: 'Warm off-white background' },
    { id: 'dark', label: 'Dark', sub: 'OLED-friendly near-black' },
    { id: 'system', label: 'Match system', sub: 'Follow iOS / Android setting' },
  ];
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Appearance" onBack={onBack} t={t} />

      {/* Theme preview */}
      <div style={{ padding: '20px 20px 0', display: 'flex', gap: 12 }}>
        {[
          { id: 'light', bg: '#FAFAFE', ink: '#0D0620', card: '#FFFFFF' },
          { id: 'dark', bg: '#080514', ink: '#EDE9F9', card: '#0F0A1E' },
        ].map(p => (
          <button key={p.id} onClick={() => setMode(p.id)} style={{
            flex: 1, padding: 0, border: `1.5px solid ${mode === p.id ? t.ink : t.line}`,
            borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: p.bg,
          }}>
            <div style={{ padding: 14, height: 90, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ height: 8, width: '60%', borderRadius: 4, background: p.ink, opacity: 0.85 }} />
              <div style={{ height: 6, width: '40%', borderRadius: 3, background: p.ink, opacity: 0.4 }} />
              <div style={{ flex: 1 }} />
              <div style={{ height: 22, borderRadius: 6, background: p.card, border: `1px solid ${p.ink}22` }} />
            </div>
            <div style={{
              padding: '8px 12px', background: mode === p.id ? t.ink : t.card,
              color: mode === p.id ? t.bg : t.ink,
              fontFamily: uiFont, fontSize: 12, fontWeight: 500, textAlign: 'center',
              borderTop: `1px solid ${t.line}`,
            }}>
              {p.id === 'light' ? 'Light' : 'Dark'}
            </div>
          </button>
        ))}
      </div>

      <Group title="Mode" t={t}>
        {modes.map((m, i) => (
          <button key={m.id} onClick={() => setMode(m.id === 'system' ? 'light' : m.id)} style={{
            width: '100%', padding: '14px', display: 'flex', alignItems: 'center', gap: 12,
            border: 'none', borderBottom: i < modes.length - 1 ? `1px solid ${t.line}` : 'none',
            background: t.card, cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: 9,
              border: `1.5px solid ${mode === m.id ? t.ink : t.line}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {mode === m.id && <div style={{ width: 9, height: 9, borderRadius: 5, background: t.ink }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: uiFont, fontSize: 14, fontWeight: 500, color: t.ink }}>{m.label}</div>
              <div style={{ fontFamily: uiFont, fontSize: 11, color: t.ink3, marginTop: 2 }}>{m.sub}</div>
            </div>
          </button>
        ))}
      </Group>

      <Group title="Density" t={t}>
        <Item label="Comfortable" value="✓" t={t} onClick={() => {}} />
        <Item label="Compact" t={t} onClick={() => {}} last />
      </Group>

      <Group title="Accessibility" t={t}>
        <ToggleItem label="Larger text" on={false} onChange={() => {}} t={t} />
        <ToggleItem label="Reduce motion" sub="Skip transitions and pulsing dots" on={false} onChange={() => {}} t={t} />
        <ToggleItem label="Bold financial figures" on={true} onChange={() => {}} t={t} last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ Language ============
function LanguageScreen({ onBack, t }) {
  const [lang, setLang] = useStateS('id');
  const langs = [
    { id: 'id', label: 'Bahasa Indonesia', sub: 'Default' },
    { id: 'en', label: 'English', sub: 'United States' },
    { id: 'zh', label: '中文', sub: 'Simplified · Coming soon', disabled: true },
    { id: 'ja', label: '日本語', sub: 'Coming soon', disabled: true },
  ];
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Language & region" onBack={onBack} t={t} />

      <Group title="App language" t={t}>
        {langs.map((l, i) => (
          <button key={l.id} disabled={l.disabled} onClick={() => !l.disabled && setLang(l.id)} style={{
            width: '100%', padding: '14px', display: 'flex', alignItems: 'center', gap: 12,
            border: 'none', borderBottom: i < langs.length - 1 ? `1px solid ${t.line}` : 'none',
            background: t.card, cursor: l.disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
            opacity: l.disabled ? 0.5 : 1,
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: 9,
              border: `1.5px solid ${lang === l.id ? t.ink : t.line}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {lang === l.id && <div style={{ width: 9, height: 9, borderRadius: 5, background: t.ink }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: uiFont, fontSize: 14, fontWeight: 500, color: t.ink }}>{l.label}</div>
              <div style={{ fontFamily: uiFont, fontSize: 11, color: t.ink3, marginTop: 2 }}>{l.sub}</div>
            </div>
          </button>
        ))}
      </Group>

      <Group title="Region" t={t}>
        <Item label="Country" value="Indonesia" t={t} onClick={() => {}} />
        <Item label="Currency display" value="IDR (Rp)" t={t} onClick={() => {}} />
        <Item label="Time zone" value="WIB · UTC+7" t={t} onClick={() => {}} />
        <Item label="Date format" value="DD MMM YYYY" t={t} onClick={() => {}} last />
      </Group>

      <Group title="Number format" t={t}>
        <Item label="Thousand separator" value="1.000.000" t={t} mono onClick={() => {}} />
        <Item label="Decimal separator" value="0,30%" t={t} mono onClick={() => {}} last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ Notifications ============
function NotifsScreen({ onBack, t }) {
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Notifications" onBack={onBack} t={t} />

      <Group title="Channels" t={t}>
        <ToggleItem label="Push notifications" sub="Required for payment receipts" on={true} onChange={() => {}} t={t} />
        <ToggleItem label="Email" sub="hello@solq.id" on={true} onChange={() => {}} t={t} />
        <ToggleItem label="In-app banners" on={true} onChange={() => {}} t={t} last />
      </Group>

      <Group title="Payment events" t={t}>
        <ToggleItem label="Authorization requested" on={true} onChange={() => {}} t={t} />
        <ToggleItem label="Payment completed" on={true} onChange={() => {}} t={t} />
        <ToggleItem label="Payment failed" sub="Always on for safety" on={true} onChange={() => {}} t={t} />
        <ToggleItem label="Slippage exceeded" on={true} onChange={() => {}} t={t} last />
      </Group>

      <Group title="On-chain alerts" hint="Ambient signals from your connected wallet — purely informational." t={t}>
        <ToggleItem label="Incoming USDC" on={true} onChange={() => {}} t={t} />
        <ToggleItem label="Token balance below threshold" sub="Warn when USDC drops under 10" on={false} onChange={() => {}} t={t} />
        <ToggleItem label="SOL price moves > 5%" on={false} onChange={() => {}} t={t} last />
      </Group>

      <Group title="Quiet hours" t={t}>
        <ToggleItem label="Mute non-critical 22:00 → 07:00" on={true} onChange={() => {}} t={t} last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ About ============
function AboutScreen({ onBack, t }) {
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="About" onBack={onBack} t={t} />

      <div style={{ padding: '32px 20px 0', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '0 auto 14px' }}>
          {typeof SolqQ !== 'undefined' ? <SolqQ size={56} /> : (
            <div style={{
              width: 56, height: 56, borderRadius: 13, background: 'linear-gradient(135deg,#9333EA 0%,#3B82F6 52%,#10D9AA 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontFamily: monoFont, fontWeight: 600, fontSize: 22,
            }}>SQ</div>
          )}
        </div>
        <div style={{ fontFamily: uiFont, fontSize: 22, fontWeight: 600, color: t.ink, letterSpacing: -0.4 }}>SOLQ</div>
        <div style={{ fontFamily: uiFont, fontSize: 12, color: t.ink3, marginTop: 4 }}>
          Non-custodial Solana × QRIS payment orchestrator
        </div>
        <div style={{ fontFamily: monoFont, fontSize: 11, color: t.ink3, marginTop: 12 }}>
          v 0.4.2 · build 1207 · 2026-04-26
        </div>
      </div>

      <Group title="Build" t={t}>
        <Item label="Version" value="0.4.2" t={t} mono />
        <Item label="Commit" value="a7f3c91" t={t} mono onClick={() => {}} />
        <Item label="Solana RPC" value="Helius mainnet" t={t} />
        <Item label="Aggregator" value="Jupiter v6" t={t} last />
      </Group>

      <Group title="Acknowledgments" t={t}>
        <Item label="Solana Labs" t={t} onClick={() => {}} />
        <Item label="Jupiter Aggregator" t={t} onClick={() => {}} />
        <Item label="Mobile Wallet Adapter" t={t} onClick={() => {}} />
        <Item label="Open-source licenses" t={t} onClick={() => {}} last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
      <div style={{ padding: '20px', textAlign: 'center', fontFamily: uiFont, fontSize: 11, color: t.ink3, lineHeight: 1.5 }}>
        Made with care in Jakarta · Bandung · Singapore<br/>© 2026 SOLQ Labs
      </div>
    </div>
  );
}

// ============ Legal ============
function LegalScreen({ onBack, t }) {
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Legal & compliance" onBack={onBack} t={t} />

      <Group title="Posture" hint="SOLQ is an orchestrator — we route payments through licensed Indonesian payment partners. We never custody funds." t={t}>
        <Item label="Non-custodial" value="✓" t={t} />
        <Item label="BI-aware" sub="Bank Indonesia regulatory awareness" t={t} />
        <Item label="OJK partner" sub="via licensed PJP for IDR settlement" t={t} last />
      </Group>

      <Group title="Documents" t={t}>
        <Item label="Terms of service" t={t} onClick={() => {}} />
        <Item label="Privacy policy" t={t} onClick={() => {}} />
        <Item label="Acceptable use" t={t} onClick={() => {}} />
        <Item label="Risk disclosures" sub="Volatility, slippage, on-chain finality" t={t} onClick={() => {}} last />
      </Group>

      <Group title="Data" t={t}>
        <Item label="Data we hold" sub="Email, audit log, payment metadata" t={t} onClick={() => {}} />
        <Item label="Data we never hold" sub="Seed phrase, private keys, KTP raw image" t={t} onClick={() => {}} />
        <Item label="Request data export" t={t} onClick={() => {}} />
        <Item label="Delete my account" t={t} onClick={() => {}} danger last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ Help ============
function HelpScreen({ onBack, t }) {
  return (
    <div style={{ background: t.bg, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <SettingsHeader title="Help & support" onBack={onBack} t={t} />

      <Group title="Self-serve" t={t}>
        <Item icon={<Icon name="book" t={t} />} label="Documentation" sub="docs.solq.id" t={t} onClick={() => {}} />
        <Item icon={<Icon name="help" t={t} />} label="FAQ" sub="42 articles" t={t} onClick={() => {}} />
        <Item icon={<Icon name="info" t={t} />} label="System status" sub="All systems operational" t={t} onClick={() => {}} last />
      </Group>

      <Group title="Common issues" t={t}>
        <Item label="My payment is stuck on Settling" t={t} onClick={() => {}} />
        <Item label="Slippage exceeded — what now?" t={t} onClick={() => {}} />
        <Item label="Why is my limit Rp 2,000,000?" t={t} onClick={() => {}} />
        <Item label="The merchant didn't get paid" t={t} onClick={() => {}} last />
      </Group>

      <Group title="Contact" t={t}>
        <Item label="Live chat" sub="Mon–Sat · 09:00–21:00 WIB" t={t} onClick={() => {}} />
        <Item label="Email support" value="hello@solq.id" t={t} onClick={() => {}} />
        <Item label="Report a security issue" sub="security@solq.id · PGP key" t={t} onClick={() => {}} last />
      </Group>

      <Group title="Diagnostics" t={t}>
        <Item icon={<Icon name="download" t={t} />} label="Generate diagnostic report" sub="Anonymized · safe to share" t={t} onClick={() => {}} last />
      </Group>

      <div style={{ flex: 1, minHeight: 24 }} />
    </div>
  );
}

// ============ Settings router ============
function SettingsRouter({ onBack, t, dark, setDark, profile, setProfile, wallet }) {
  const [page, setPage] = useStateS('index');
  const back = () => setPage('index');
  const props = { onBack: back, t, dark };

  if (page === 'index') return <SettingsIndex onBack={onBack} t={t} dark={dark} go={setPage} profile={profile} wallet={wallet} />;
  if (page === 'profile') return <ProfileScreen {...props} profile={profile} setProfile={setProfile} />;
  if (page === 'kyc') return <KycScreen {...props} />;
  if (page === 'limits') return <LimitsScreen {...props} />;
  if (page === 'wallets') return <WalletsScreen {...props} wallet={wallet} />;
  if (page === 'network') return <NetworkScreen {...props} />;
  if (page === 'routing') return <RoutingScreen {...props} />;
  if (page === 'qris') return <QrisScreen {...props} />;
  if (page === 'receipts') return <ReceiptsScreen {...props} />;
  if (page === 'lock') return <LockScreen {...props} />;
  if (page === 'sessions') return <SessionsScreen {...props} />;
  if (page === 'audit') return <AuditScreen {...props} />;
  if (page === 'appearance') return <AppearanceScreen {...props} setDark={setDark} />;
  if (page === 'language') return <LanguageScreen {...props} />;
  if (page === 'notifs') return <NotifsScreen {...props} />;
  if (page === 'about') return <AboutScreen {...props} />;
  if (page === 'legal') return <LegalScreen {...props} />;
  if (page === 'help') return <HelpScreen {...props} />;
  return <SettingsIndex onBack={onBack} t={t} dark={dark} go={setPage} profile={profile} wallet={wallet} />;
}

// ============ Bottom tab bar ============
function TabBar({ active, onChange, t }) {
  const tabs = [
    { id: 'home', label: 'Pay', icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="10" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/><path d="M10 10h3v3h-3zM16 10v6M13 16h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
    { id: 'history', label: 'Activity', icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 4h12M3 9h12M3 14h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
    { id: 'settings', label: 'Settings', icon: <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.5 3.5l1.5 1.5M13 13l1.5 1.5M3.5 14.5l1.5-1.5M13 5l1.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  ];
  return (
    <div style={{
      borderTop: `1px solid ${t.line}`, background: t.bg,
      padding: '6px 10px 8px', display: 'flex', justifyContent: 'space-around',
    }}>
      {tabs.map(tab => {
        const on = active === tab.id;
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)} style={{
            flex: 1, padding: '8px 4px', border: 'none', background: 'transparent',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            color: on ? t.ink : t.ink3, cursor: 'pointer',
          }}>
            {tab.icon}
            <span style={{ fontFamily: uiFont, fontSize: 10, fontWeight: on ? 600 : 500, letterSpacing: 0.2 }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

Object.assign(window, {
  themes, SettingsRouter, SettingsIndex, ProfileScreen, KycScreen, LimitsScreen,
  WalletsScreen, NetworkScreen, RoutingScreen, QrisScreen, ReceiptsScreen,
  LockScreen, SessionsScreen, AuditScreen, AppearanceScreen, LanguageScreen,
  NotifsScreen, AboutScreen, LegalScreen, HelpScreen, TabBar,
});
