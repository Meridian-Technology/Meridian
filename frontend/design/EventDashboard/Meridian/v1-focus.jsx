/* Shared chrome — AppSidebar, Sparkline, PosterPlaceholder + WorkspaceRail */

const Sparkline = ({color = 'var(--primary)', flat = false}) => (
  <svg viewBox="0 0 240 60" preserveAspectRatio="none" width="100%" height="60">
    <defs>
      <linearGradient id={`spark-${flat ? 'f' : 'g'}`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity="0.18"/>
        <stop offset="1" stopColor={color} stopOpacity="0"/>
      </linearGradient>
    </defs>
    <path d={flat
      ? "M0,40 L240,40 L240,60 L0,60 Z"
      : "M0,55 L8,54 L16,53 L24,52 L32,51 L40,49 L48,48 L56,46 L64,44 L72,42 L80,39 L88,36 L96,34 L104,32 L112,29 L120,27 L128,24 L136,22 L144,19 L152,17 L160,14 L168,12 L176,10 L184,8 L192,7 L200,6 L208,5 L216,4 L224,3 L232,2 L240,2 L240,60 L0,60 Z"
    } fill={`url(#spark-${flat ? 'f' : 'g'})`}/>
    <path d={flat
      ? "M0,40 L240,40"
      : "M0,55 L8,54 L16,53 L24,52 L32,51 L40,49 L48,48 L56,46 L64,44 L72,42 L80,39 L88,36 L96,34 L104,32 L112,29 L120,27 L128,24 L136,22 L144,19 L152,17 L160,14 L168,12 L176,10 L184,8 L192,7 L200,6 L208,5 L216,4 L224,3 L232,2 L240,2"
    } fill="none" stroke={color} strokeWidth="1.75"/>
  </svg>
);

const PosterPlaceholder = ({w = 160, h = 220, empty = false}) => (
  empty ? (
    <div style={{
      width: w, height: h,
      background: 'repeating-linear-gradient(135deg, var(--bg-soft), var(--bg-soft) 8px, var(--bg) 8px, var(--bg) 16px)',
      border: '1px dashed var(--line)', borderRadius: 6,
      display: 'grid', placeItems: 'center', flexShrink: 0,
    }}>
      <div className="mono" style={{fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.08em'}}>NO POSTER</div>
    </div>
  ) : (
    <div style={{width: w, height: h, background: '#7a1518', borderRadius: 6, position: 'relative', overflow: 'hidden', flexShrink: 0}}>
      <div className="display" style={{position: 'absolute', top: 14, left: 14, right: 14, color: '#f8d4a0', fontSize: w > 180 ? 32 : 26, fontWeight: 600, lineHeight: 0.95, letterSpacing: '-0.02em'}}>CHANGE<br/>THE<br/>WORLD</div>
      <div style={{position: 'absolute', bottom: 12, left: 14, right: 14, fontFamily: 'JetBrains Mono', fontSize: 8, color: '#f8d4a0', letterSpacing: '0.05em'}}>SAT MAR 14 · 9:30 AM<br/>BIO &amp; INTERDIS</div>
      <div style={{position: 'absolute', top: '40%', left: 14, fontFamily: 'Fraunces', fontSize: w > 180 ? 38 : 32, fontStyle: 'italic', color: '#f8d4a0', fontWeight: 600}}>$5,000</div>
    </div>
  )
);

function AppSidebar({active = 'Events'}) {
  const items = [
    {label: 'Dashboard', icon: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z'},
    {label: 'Events', icon: 'M19 4h-1V2h-2v2H8V2H6v2H5C3.9 4 3 4.9 3 6v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14z'},
    {label: 'Tasks', icon: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'},
    {label: 'Announcements', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm1 17h-2v-6h2zm0-8h-2V7h2z'},
    {label: 'Members', icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3z'},
    {label: 'Settings', icon: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'},
  ];
  return (
    <div style={{
      width: 240, background: 'var(--bg-card)',
      borderRight: '1px solid var(--line-2)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
    }}>
      <div style={{padding: '20px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'conic-gradient(from 200deg, #2a8c5f, #1f6b48, #4ab382, #2a8c5f)',
            border: '2px solid white', boxShadow: '0 0 0 1px var(--line)',
          }}/>
          <div>
            <div className="display" style={{fontSize: 18, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em'}}>Meridian</div>
            <div className="mono" style={{fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.16em', marginTop: 2}}>ATLAS</div>
          </div>
        </div>
      </div>
      <div style={{padding: '0 14px 14px'}}>
        <button style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)',
          borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}>
          <span style={{display: 'flex', alignItems: 'center', gap: 8}}>
            <span style={{width: 18, height: 18, borderRadius: 4, background: 'linear-gradient(135deg, #ddd9c8, #c4d9ca)'}}/>
            Meridian De…
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 10l5 5 5-5"/></svg>
        </button>
      </div>
      <nav style={{padding: '0 8px', flex: 1}}>
        {items.map(it => (
          <a key={it.label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', margin: '1px 0',
            fontSize: 13.5, fontWeight: it.label === active ? 600 : 500,
            color: it.label === active ? 'var(--ink)' : 'var(--ink-2)',
            background: it.label === active ? 'var(--primary-tint)' : 'transparent',
            borderRadius: 8, cursor: 'pointer',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill={it.label === active ? 'var(--primary)' : 'currentColor'}><path d={it.icon}/></svg>
            {it.label}
          </a>
        ))}
      </nav>
      <div style={{padding: 14, display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--line-2)'}}>
        <div style={{width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #c4b5fd, #a7f3d0)'}}/>
        <div>
          <div style={{fontSize: 13, fontWeight: 600}}>James</div>
          <div style={{fontSize: 11, color: 'var(--ink-3)'}}>@James</div>
        </div>
      </div>
    </div>
  );
}

/* Workspace rail used by all four states. Items can be disabled (state 1) or alerted (state 2/3). */
function WorkspaceRail({items, label = 'WORKSPACE'}) {
  return (
    <nav style={{padding: '8px 0 0 24px', borderRight: '1px solid var(--line-2)'}}>
      <div className="mono" style={{fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.08em', padding: '4px 12px 8px'}}>{label}</div>
      {items.map(item => (
        <a key={item.key} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', margin: '0 8px 2px 0',
          fontSize: 13.5, fontWeight: item.active ? 600 : 500,
          color: item.disabled ? 'var(--ink-4)' : item.active ? 'var(--ink)' : 'var(--ink-2)',
          background: item.active ? 'var(--bg-card)' : 'transparent',
          border: item.active ? '1px solid var(--line)' : '1px solid transparent',
          borderRadius: 8, cursor: item.disabled ? 'not-allowed' : 'pointer',
          opacity: item.disabled ? 0.55 : 1,
        }}>
          <span style={{display: 'flex', alignItems: 'center', gap: 8}}>
            {item.label}
            {item.disabled && <span className="mono" style={{fontSize: 9, color: 'var(--ink-4)', letterSpacing: '0.08em'}}>LOCKED</span>}
          </span>
          {item.count != null && (
            <span className="mono" style={{
              fontSize: 11,
              color: item.alert ? 'var(--warn)' : item.live ? '#c4533a' : 'var(--ink-3)',
              background: item.alert ? 'var(--warn-soft)' : item.live ? '#f6dcd4' : item.active ? 'var(--bg-soft)' : 'transparent',
              padding: '2px 6px', borderRadius: 4, fontWeight: 500,
            }}>{item.count}</span>
          )}
        </a>
      ))}
    </nav>
  );
}

/* Status pill helper */
function StatusPill({tone, label, dot = true}) {
  const tones = {
    draft: {bg: 'var(--bg-soft)', fg: 'var(--ink-3)', dot: 'var(--ink-4)'},
    prep:  {bg: 'var(--primary-tint)', fg: 'var(--primary)', dot: 'var(--primary)'},
    live:  {bg: '#fde7e1', fg: '#a8412c', dot: '#c4533a'},
    past:  {bg: 'var(--bg-soft)', fg: 'var(--ink-3)', dot: 'var(--ink-4)'},
  };
  const t = tones[tone] || tones.prep;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 12, fontWeight: 500, color: t.fg,
      background: t.bg, padding: '4px 10px', borderRadius: 999,
      letterSpacing: '0.02em',
    }}>
      {dot && <span style={{width: 6, height: 6, borderRadius: '50%', background: t.dot, boxShadow: tone === 'live' ? `0 0 0 3px ${t.dot}33` : 'none'}}/>}
      {label}
    </span>
  );
}

window.Sparkline = Sparkline;
window.PosterPlaceholder = PosterPlaceholder;
window.AppSidebar = AppSidebar;
window.WorkspaceRail = WorkspaceRail;
window.StatusPill = StatusPill;
