/* State 3 — LIVE. Day-of, event in progress.
   Goals:
   - Operations console. Big numbers. Fast actions. Almost no chrome.
   - Live check-in pace, capacity meter, current agenda block.
   - One-tap actions: send announcement, open scanner, page volunteers. */

function StateLive() {
  const items = [
    {key: 'live', label: 'Live ops', active: true, live: true, count: 'NOW'},
    {key: 'checkin', label: 'Check-in', count: 96, live: true},
    {key: 'schedule', label: 'Schedule', count: '4/12'},
    {key: 'tasks', label: 'Tasks', count: 1, alert: true},
    {key: 'people', label: 'People', count: 177},
    {key: 'jobs', label: 'Jobs', count: 5},
    {key: 'comms', label: 'Communications', count: 0},
  ];

  return (
    <div style={{width: 1440, height: 980, background: '#0f1714', display: 'flex', fontFamily: 'Inter, sans-serif', color: 'var(--ink)', overflow: 'hidden'}}>
      <AppSidebar />
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#fbf8f1'}}>
        {/* Slim live header */}
        <div style={{padding: '14px 32px', background: '#1c2520', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
            <button style={{width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'white'}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <span style={{display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em'}}>
              <span style={{width: 8, height: 8, borderRadius: '50%', background: '#ef6e52', boxShadow: '0 0 0 4px rgba(239,110,82,0.25)'}}/>
              LIVE · DAY 1
            </span>
            <span style={{fontSize: 13, fontWeight: 500, opacity: 0.85}}>Change the World Innovation Weekend</span>
            <span className="mono" style={{fontSize: 11, opacity: 0.55, letterSpacing: '0.05em'}}>11:24 AM · 4h 36m elapsed</span>
          </div>
          <div style={{display: 'flex', gap: 8}}>
            <button style={{fontSize: 12.5, fontWeight: 500, padding: '7px 12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: 'white', borderRadius: 7, cursor: 'pointer'}}>Page volunteers</button>
            <button style={{fontSize: 12.5, fontWeight: 600, padding: '7px 14px', background: '#ef6e52', color: '#1c1410', border: 'none', borderRadius: 7, cursor: 'pointer'}}>Send announcement</button>
          </div>
        </div>

        <div style={{flex: 1, display: 'grid', gridTemplateColumns: '184px 1fr', minHeight: 0}}>
          <div style={{borderRight: '1px solid var(--line-2)', paddingTop: 8, background: 'var(--bg-card)'}}>
            <WorkspaceRail items={items} label="LIVE OPS"/>
          </div>

          <div style={{padding: '20px 32px 28px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 14}}>
            {/* The single 'now' panel — current schedule block + actions */}
            <div style={{
              background: 'linear-gradient(95deg, #1c2520, #2a3a30)', color: 'white',
              borderRadius: 14, padding: '20px 26px',
              display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'center',
            }}>
              <div>
                <div className="mono" style={{fontSize: 10.5, color: '#a3c4b1', letterSpacing: '0.1em', marginBottom: 6}}>HAPPENING NOW · ROOM A</div>
                <div className="display" style={{fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em', marginBottom: 6}}>Opening keynote — Dr. Patel</div>
                <div style={{fontSize: 13, color: '#c5d3cb'}}>10:00 AM – 11:30 AM · ends in <strong style={{color: 'white'}}>6 minutes</strong></div>
              </div>
              <div style={{display: 'flex', gap: 8}}>
                <button style={{fontSize: 12.5, padding: '8px 12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: 'white', borderRadius: 7, cursor: 'pointer'}}>View slot</button>
                <button style={{fontSize: 12.5, fontWeight: 600, padding: '8px 14px', background: '#4ab382', color: '#0c1f15', border: 'none', borderRadius: 7, cursor: 'pointer'}}>Advance →</button>
              </div>
            </div>

            {/* Big live numbers row */}
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10}}>
              {[
                {k: 'Checked in', v: '139', sub: 'of 177 registered', meter: 0.785, accent: 'primary'},
                {k: 'Capacity', v: '78%', sub: '139 / 200 max', meter: 0.78, accent: 'primary'},
                {k: 'On schedule', v: '+0:06', sub: 'running 6 min over', meter: 0.5, accent: 'warn'},
                {k: 'Issues', v: '1', sub: 'AV in Room B', meter: 1, accent: 'warn'},
              ].map((s, i) => (
                <div key={i} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--line)',
                  borderRadius: 12, padding: '16px 18px',
                }}>
                  <div className="mono" style={{fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10}}>{s.k}</div>
                  <div style={{display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6}}>
                    <div className="display" style={{fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1, color: s.accent === 'warn' ? 'var(--warn)' : 'var(--ink)'}}>{s.v}</div>
                  </div>
                  <div style={{fontSize: 12, color: 'var(--ink-3)', marginBottom: 10}}>{s.sub}</div>
                  <div style={{height: 4, background: 'var(--bg-soft)', borderRadius: 2, overflow: 'hidden'}}>
                    <div style={{width: `${s.meter * 100}%`, height: '100%', background: s.accent === 'warn' ? 'var(--warn)' : 'var(--primary)'}}/>
                  </div>
                </div>
              ))}
            </div>

            {/* Two columns: live check-in + agenda */}
            <div style={{display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, flex: 1, minHeight: 0}}>
              <div style={{background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14}}>
                  <div style={{fontSize: 14, fontWeight: 600}}>Check-in flow · last 60 min</div>
                  <div style={{display: 'flex', gap: 8}}>
                    <button style={{fontSize: 11.5, padding: '6px 10px', border: '1px solid var(--line)', background: 'var(--bg)', borderRadius: 6, cursor: 'pointer', color: 'var(--ink-2)', fontWeight: 500}}>Open scanner</button>
                  </div>
                </div>
                <div style={{flex: 1, position: 'relative', minHeight: 160}}>
                  <Sparkline color="#c4533a"/>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--line-2)'}}>
                  {[
                    {k: 'Peak rate', v: '14 / min', t: '9:42 AM'},
                    {k: 'Now', v: '2 / min', t: 'live'},
                    {k: 'No-shows', v: '38', t: '21.5%'},
                  ].map((m, i) => (
                    <div key={i}>
                      <div className="mono" style={{fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.06em'}}>{m.k.toUpperCase()}</div>
                      <div style={{fontSize: 18, fontWeight: 600, marginTop: 2}}>{m.v}</div>
                      <div style={{fontSize: 11, color: 'var(--ink-3)'}}>{m.t}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', minHeight: 0}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12}}>
                  <div style={{fontSize: 14, fontWeight: 600}}>Up next</div>
                  <button style={{fontSize: 11.5, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer'}}>Full agenda →</button>
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden'}}>
                  {[
                    {time: '11:30 AM', title: 'Track kickoff — Climate', room: 'Room A', accent: true},
                    {time: '11:30 AM', title: 'Track kickoff — Health', room: 'Room B'},
                    {time: '12:00 PM', title: 'Lunch · catered', room: 'Atrium'},
                    {time: '01:00 PM', title: 'Build sprint 1', room: 'All rooms'},
                    {time: '03:00 PM', title: 'Mentor office hours', room: 'Lounge'},
                    {time: '05:30 PM', title: 'Day 1 wrap', room: 'Room A'},
                  ].map((s, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 12, alignItems: 'center',
                      padding: '8px 10px', borderRadius: 8,
                      background: s.accent ? 'var(--primary-tint)' : 'transparent',
                      border: s.accent ? '1px solid var(--primary-soft)' : '1px solid transparent',
                    }}>
                      <div className="mono" style={{fontSize: 11, fontWeight: 600, color: s.accent ? 'var(--primary)' : 'var(--ink-3)', width: 64, flexShrink: 0}}>{s.time}</div>
                      <div style={{flex: 1, minWidth: 0}}>
                        <div style={{fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{s.title}</div>
                        <div style={{fontSize: 11, color: 'var(--ink-3)'}}>{s.room}</div>
                      </div>
                      {s.accent && <span className="mono" style={{fontSize: 10, color: 'var(--primary)', letterSpacing: '0.06em', fontWeight: 600}}>NEXT</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.StateLive = StateLive;
