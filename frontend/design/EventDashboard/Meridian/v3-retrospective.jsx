/* State 2 — PREPARING. Foundation done. T-minus countdown.
   Goals:
   - Time-aware: a countdown front and center; "this week" framing.
   - Outreach + tasks are the headline activities.
   - Registration chart is here, but kept as a small read-only snapshot. */

function StatePreparing() {
  const items = [
    {key: 'overview', label: 'Overview', active: true},
    {key: 'schedule', label: 'Schedule', count: 12},
    {key: 'tasks', label: 'Tasks', count: 4, alert: true},
    {key: 'people', label: 'People', count: 64},
    {key: 'jobs', label: 'Jobs', count: 5},
    {key: 'comms', label: 'Communications', count: 1},
    {key: 'insights', label: 'Insights'},
  ];

  return (
    <div style={{width: 1440, height: 980, background: 'var(--bg)', display: 'flex', fontFamily: 'Inter, sans-serif', color: 'var(--ink)', overflow: 'hidden'}}>
      <AppSidebar />
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0}}>
        {/* Header */}
        <div style={{padding: '24px 40px 0'}}>
          <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24}}>
            <div style={{minWidth: 0, flex: 1}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8}}>
                <button style={{width: 28, height: 28, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-card)', display: 'grid', placeItems: 'center', cursor: 'pointer'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <div className="mono" style={{fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.05em'}}>EVENTS / CHANGE THE WORLD INNOVATION WEEKEND</div>
              </div>
              <div style={{display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap'}}>
                <h1 className="display" style={{margin: 0, fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05}}>Change the World Innovation Weekend</h1>
                <StatusPill tone="prep" label="Published · 11 days out"/>
              </div>
              <div style={{display: 'flex', gap: 28, marginTop: 14, fontSize: 13.5, color: 'var(--ink-2)', flexWrap: 'wrap'}}>
                <span>Sat, Mar 14, 2026</span>
                <span style={{color: 'var(--ink-4)'}}>·</span>
                <span>9:30 AM – 6:00 PM</span>
                <span style={{color: 'var(--ink-4)'}}>·</span>
                <span>Biotechnology &amp; Interdis Bldg</span>
              </div>
            </div>
            <div style={{display: 'flex', gap: 8, flexShrink: 0}}>
              <button style={{fontSize: 13, fontWeight: 500, padding: '10px 14px', border: '1px solid var(--line)', background: 'var(--bg-card)', borderRadius: 8, cursor: 'pointer', color: 'var(--ink-2)'}}>Preview page</button>
              <button style={{fontSize: 13, fontWeight: 600, padding: '10px 18px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                Send announcement
              </button>
            </div>
          </div>
        </div>

        <div style={{flex: 1, display: 'grid', gridTemplateColumns: '184px 1fr', minHeight: 0, marginTop: 28}}>
          <WorkspaceRail items={items}/>

          <div style={{padding: '8px 40px 40px 32px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 16}}>
            {/* Countdown hero — combines T-minus + this-week framing */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--line)',
              borderRadius: 14, padding: '24px 28px',
              display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 32, alignItems: 'stretch',
            }}>
              <div style={{borderRight: '1px solid var(--line-2)', paddingRight: 32}}>
                <div className="mono" style={{fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.08em', marginBottom: 14}}>EVENT STARTS IN</div>
                <div style={{display: 'flex', alignItems: 'baseline', gap: 14}}>
                  <div className="display" style={{fontSize: 96, fontWeight: 500, letterSpacing: '-0.04em', lineHeight: 0.85}}>11</div>
                  <div>
                    <div className="display" style={{fontSize: 24, fontWeight: 500, color: 'var(--ink-2)', lineHeight: 1}}>days</div>
                    <div style={{fontSize: 13, color: 'var(--ink-3)', marginTop: 4}}>4 hrs · 26 min</div>
                  </div>
                </div>
                <div style={{display: 'flex', gap: 4, marginTop: 18}}>
                  {Array.from({length: 30}).map((_, i) => (
                    <div key={i} style={{
                      flex: 1, height: 4, borderRadius: 2,
                      background: i < 19 ? 'var(--primary-soft)' : i < 19 ? 'var(--primary)' : 'var(--bg-soft)',
                    }}/>
                  ))}
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'JetBrains Mono', marginTop: 6}}>
                  <span>Feb 13 · created</span>
                  <span>today</span>
                  <span>Mar 14 · live</span>
                </div>
              </div>
              <div style={{paddingLeft: 0}}>
                <div className="mono" style={{fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.08em', marginBottom: 12}}>THIS WEEK · 4 ITEMS NEED YOU</div>
                <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                  {[
                    {who: 'You', body: 'Send the second outreach email', due: 'by Tue', tone: 'urgent'},
                    {who: 'You', body: 'Confirm catering count with vendor', due: 'by Wed', tone: 'urgent'},
                    {who: 'Sam', body: 'Finalize judging rubric', due: 'by Thu', tone: 'normal'},
                    {who: 'Devi', body: 'Book A/V equipment', due: 'by Fri', tone: 'normal'},
                  ].map((t, i) => (
                    <div key={i} style={{display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < 3 ? '1px solid var(--line-2)' : 'none'}}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: t.tone === 'urgent' ? 'var(--warn-soft)' : 'var(--bg-soft)',
                        color: t.tone === 'urgent' ? 'var(--warn)' : 'var(--ink-3)',
                        display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0,
                      }}>{t.who[0]}</div>
                      <div style={{flex: 1, fontSize: 13, color: 'var(--ink)'}}>{t.body}</div>
                      <div className="mono" style={{fontSize: 10.5, color: t.tone === 'urgent' ? 'var(--warn)' : 'var(--ink-3)', letterSpacing: '0.04em', fontWeight: 500}}>{t.due}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Three secondary panels: registration pace, outreach, ops */}
            <div style={{display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 12, flex: 1, minHeight: 0}}>
              <div style={{background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12}}>
                  <div style={{fontSize: 14, fontWeight: 600}}>Registration pace</div>
                  <span className="mono" style={{fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.06em'}}>30 DAYS</span>
                </div>
                <div style={{display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4}}>
                  <div className="display" style={{fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1}}>64</div>
                  <div style={{fontSize: 12, color: 'var(--ink-3)'}}>of 100 expected · 64%</div>
                </div>
                <div style={{fontSize: 12, color: 'var(--primary)', fontWeight: 500, marginBottom: 12}}>+12 this week · on track to hit goal</div>
                <div style={{flex: 1, position: 'relative', minHeight: 110}}>
                  <Sparkline />
                  <div style={{position: 'absolute', left: 0, right: 0, top: '60%', borderTop: '1px dashed var(--ink-4)', opacity: 0.4}}/>
                  <div className="mono" style={{position: 'absolute', right: 0, top: '52%', fontSize: 10, color: 'var(--ink-4)'}}>goal · 100</div>
                </div>
              </div>

              <div style={{background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column'}}>
                <div style={{fontSize: 14, fontWeight: 600, marginBottom: 14}}>Outreach</div>
                {[
                  {label: 'Initial announcement', sub: 'Sent Feb 14 · 412 reached', done: true},
                  {label: 'Mid-cycle reminder', sub: 'Sent Mar 1 · 38 new RSVPs', done: true},
                  {label: 'Final push', sub: 'Suggested: Wed Mar 11', done: false, current: true},
                  {label: 'Day-of confirmation', sub: 'Auto · Mar 14 6 AM', done: false},
                ].map((s, i) => (
                  <div key={i} style={{display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < 3 ? '1px solid var(--line-2)' : 'none'}}>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                      border: s.done ? 'none' : s.current ? '2px solid var(--primary)' : '2px solid var(--line)',
                      background: s.done ? 'var(--primary)' : 'transparent',
                    }}>
                      {s.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" style={{marginLeft: 1, marginTop: 1}}><path d="M5 13l4 4L19 7"/></svg>}
                    </div>
                    <div style={{flex: 1}}>
                      <div style={{fontSize: 12.5, fontWeight: s.current ? 600 : 500, color: s.done ? 'var(--ink-3)' : 'var(--ink)'}}>{s.label}</div>
                      <div style={{fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1}}>{s.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column'}}>
                <div style={{fontSize: 14, fontWeight: 600, marginBottom: 14}}>Run-of-show readiness</div>
                {[
                  {k: 'Schedule blocks', v: '12 / 12', good: true},
                  {k: 'Speakers confirmed', v: '6 / 8', good: false},
                  {k: 'Volunteer roles', v: '5 / 5', good: true},
                  {k: 'Equipment booked', v: '3 / 5', good: false},
                  {k: 'Venue walkthrough', v: 'Mar 12', good: true},
                ].map((r, i) => (
                  <div key={i} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 4 ? '1px solid var(--line-2)' : 'none'}}>
                    <span style={{fontSize: 12.5, color: 'var(--ink-2)'}}>{r.k}</span>
                    <span className="mono" style={{
                      fontSize: 11.5, fontWeight: 600,
                      color: r.good ? 'var(--primary)' : 'var(--warn)',
                    }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.StatePreparing = StatePreparing;
