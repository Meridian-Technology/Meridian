/* State 1 — JUST CREATED. Empty event. The user just clicked "Create event".
   Goals:
   - Make the next setup step obvious (and the second one too).
   - Defer everything that hasn't earned its place: tabs are mostly locked.
   - The screen reads like a checklist, not a dashboard. */

function StateCreated() {
  const items = [
    {key: 'overview', label: 'Setup', count: '2/8', active: true},
    {key: 'schedule', label: 'Schedule', disabled: true},
    {key: 'tasks', label: 'Tasks', disabled: true},
    {key: 'people', label: 'People', count: 0, disabled: true},
    {key: 'jobs', label: 'Jobs', disabled: true},
    {key: 'comms', label: 'Communications', disabled: true},
    {key: 'insights', label: 'Insights', disabled: true},
  ];

  const checklist = [
    {done: true, title: 'Name your event', sub: '"Change the World Innovation Weekend"', mins: 1},
    {done: true, title: 'Pick a date', sub: 'Saturday, March 14, 2026 · 9:30 AM – 6:00 PM', mins: 1},
    {done: false, current: true, title: 'Add a location', sub: 'Where is this happening? Required to publish.', mins: 2, cta: 'Add location'},
    {done: false, title: 'Write a description', sub: 'Tell people why they should come. 2–4 paragraphs is plenty.', mins: 5},
    {done: false, title: 'Upload a poster or hero image', sub: 'Optional, but events with a poster see 3× more registrations.', mins: 2},
    {done: false, title: 'Build a registration form', sub: 'Default is name + email. Add custom fields if needed.', mins: 4},
    {done: false, title: 'Set capacity & expected attendance', sub: 'Used for waitlists and analytics goals.', mins: 1},
    {done: false, title: 'Publish', sub: 'Sends to your org\'s feed. You can still edit after publishing.', mins: 1, terminal: true},
  ];

  return (
    <div style={{width: 1440, height: 980, background: 'var(--bg)', display: 'flex', fontFamily: 'Inter, sans-serif', color: 'var(--ink)', overflow: 'hidden'}}>
      <AppSidebar />
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0}}>
        <div style={{padding: '24px 40px 0', background: 'var(--bg)'}}>
          <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24}}>
            <div style={{minWidth: 0, flex: 1}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8}}>
                <button style={{width: 28, height: 28, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-card)', display: 'grid', placeItems: 'center', cursor: 'pointer'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <div className="mono" style={{fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.05em'}}>EVENTS / NEW · DRAFT</div>
              </div>
              <div style={{display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap'}}>
                <h1 className="display" style={{margin: 0, fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05}}>Change the World Innovation Weekend</h1>
                <StatusPill tone="draft" label="Draft · not visible to anyone"/>
              </div>
              <div style={{fontSize: 13.5, color: 'var(--ink-3)', marginTop: 12}}>
                Created 4 minutes ago · Auto-saved
              </div>
            </div>
            <div style={{display: 'flex', gap: 8, flexShrink: 0}}>
              <button style={{fontSize: 13, fontWeight: 500, padding: '10px 14px', border: '1px solid var(--line)', background: 'var(--bg-card)', borderRadius: 8, cursor: 'pointer', color: 'var(--ink-3)'}}>Discard</button>
              <button disabled style={{fontSize: 13, fontWeight: 600, padding: '10px 18px', background: 'var(--bg-soft)', color: 'var(--ink-4)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'not-allowed'}}>
                Publish · 6 steps left
              </button>
            </div>
          </div>
        </div>

        <div style={{flex: 1, display: 'grid', gridTemplateColumns: '184px 1fr', minHeight: 0, marginTop: 28}}>
          <WorkspaceRail items={items}/>

          <div style={{padding: '8px 40px 40px 32px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 20}}>
            {/* Progress hero */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--line)',
              borderRadius: 14, padding: '24px 28px',
              display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'center',
            }}>
              <div>
                <div className="mono" style={{fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.08em', marginBottom: 8}}>SETUP · 2 OF 8</div>
                <div className="display" style={{fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em', marginBottom: 14, maxWidth: 540, lineHeight: 1.2}}>
                  You are ~15 minutes away from a publishable event.
                </div>
                <div style={{display: 'flex', gap: 4, marginTop: 4}}>
                  {Array.from({length: 8}).map((_, i) => (
                    <div key={i} style={{
                      flex: 1, height: 6, borderRadius: 3,
                      background: i < 2 ? 'var(--primary)' : 'var(--bg-soft)',
                    }}/>
                  ))}
                </div>
              </div>
              <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6}}>
                <PosterPlaceholder w={92} h={130} empty/>
              </div>
            </div>

            {/* Checklist — the whole content */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--line)',
              borderRadius: 14, padding: '8px 0',
            }}>
              {checklist.map((it, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 16,
                  padding: '16px 24px',
                  borderTop: i ? '1px solid var(--line-2)' : 'none',
                  background: it.current ? 'var(--primary-tint)' : 'transparent',
                  position: 'relative',
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    border: it.done ? 'none' : it.current ? '2px solid var(--primary)' : '2px solid var(--line)',
                    background: it.done ? 'var(--primary)' : 'transparent',
                    color: 'white', display: 'grid', placeItems: 'center',
                    fontSize: 11, fontWeight: 700, marginTop: 1,
                  }}>
                    {it.done ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                    ) : (
                      <span className="mono" style={{color: it.current ? 'var(--primary)' : 'var(--ink-4)'}}>{i + 1}</span>
                    )}
                  </div>
                  <div style={{flex: 1, minWidth: 0}}>
                    <div style={{display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 3}}>
                      <span style={{
                        fontSize: 15, fontWeight: it.current ? 600 : 500,
                        color: it.done ? 'var(--ink-3)' : 'var(--ink)',
                        textDecoration: it.done ? 'line-through' : 'none',
                      }}>{it.title}</span>
                      {it.terminal && <span className="mono" style={{fontSize: 9.5, color: 'var(--ink-4)', letterSpacing: '0.06em', padding: '2px 6px', background: 'var(--bg-soft)', borderRadius: 3}}>FINAL STEP</span>}
                    </div>
                    <div style={{fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5}}>{it.sub}</div>
                  </div>
                  <div style={{display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0}}>
                    <span className="mono" style={{fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.04em'}}>~{it.mins} min</span>
                    {it.current && (
                      <button style={{
                        fontSize: 12.5, fontWeight: 600, padding: '7px 14px',
                        background: 'var(--primary)', color: 'white',
                        border: 'none', borderRadius: 7, cursor: 'pointer',
                      }}>{it.cta} →</button>
                    )}
                    {!it.current && !it.done && (
                      <button style={{
                        fontSize: 12.5, fontWeight: 500, padding: '7px 12px',
                        background: 'transparent', color: 'var(--ink-3)',
                        border: '1px solid var(--line)', borderRadius: 7, cursor: 'pointer',
                      }}>Open</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--ink-3)', padding: '0 8px'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              Tasks, registrations, communications and insights unlock once your event is published.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.StateCreated = StateCreated;
