/* State 4 — CONCLUDED. Post-mortem mode.
   Goals:
   - Pivot to retrospective: outcomes vs. expectations.
   - Voices (feedback) and wrap-up tasks share the screen.
   - The live-event chrome is fully retired. */

function StateConcluded() {
  const items = [
    {key: 'overview', label: 'Retrospective', active: true},
    {key: 'feedback', label: 'Feedback', count: 42},
    {key: 'people', label: 'Attendees', count: 139},
    {key: 'tasks', label: 'Wrap-up', count: 3, alert: true},
    {key: 'insights', label: 'Insights'},
    {key: 'archive', label: 'Archive'},
  ];

  return (
    <div style={{width: 1440, height: 980, background: 'var(--bg)', display: 'flex', fontFamily: 'Inter, sans-serif', color: 'var(--ink)', overflow: 'hidden'}}>
      <AppSidebar />
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0}}>
        <div style={{padding: '24px 40px 0'}}>
          <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24}}>
            <div style={{minWidth: 0, flex: 1}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8}}>
                <button style={{width: 28, height: 28, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-card)', display: 'grid', placeItems: 'center', cursor: 'pointer'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <div className="mono" style={{fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.05em'}}>EVENTS / RETROSPECTIVE</div>
              </div>
              <div style={{display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap'}}>
                <h1 className="display" style={{margin: 0, fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05}}>Change the World Innovation Weekend</h1>
                <StatusPill tone="past" label="Concluded · 53 days ago"/>
              </div>
              <div style={{fontSize: 13.5, color: 'var(--ink-2)', marginTop: 12}}>
                Sat, Mar 14, 2026 · 9:30 AM – 6:00 PM · Biotechnology &amp; Interdis Bldg
              </div>
            </div>
            <div style={{display: 'flex', gap: 8, flexShrink: 0}}>
              <button style={{fontSize: 13, fontWeight: 500, padding: '10px 14px', border: '1px solid var(--line)', background: 'var(--bg-card)', borderRadius: 8, cursor: 'pointer', color: 'var(--ink-2)'}}>Duplicate for 2027</button>
              <button style={{fontSize: 13, fontWeight: 600, padding: '10px 18px', background: 'var(--ink)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer'}}>Share report</button>
            </div>
          </div>
        </div>

        <div style={{flex: 1, display: 'grid', gridTemplateColumns: '184px 1fr', minHeight: 0, marginTop: 28}}>
          <WorkspaceRail items={items}/>

          <div style={{padding: '8px 40px 40px 32px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 20}}>
            {/* One-line outcome statement, editorial */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--line)',
              borderRadius: 14, padding: '28px 32px',
              display: 'grid', gridTemplateColumns: '1.4fr auto', gap: 32, alignItems: 'center',
            }}>
              <div>
                <div className="mono" style={{fontSize: 10.5, color: 'var(--primary)', letterSpacing: '0.1em', marginBottom: 12, fontWeight: 500}}>OUTCOME</div>
                <div className="display" style={{fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 12}}>
                  177 builders showed up — <span style={{color: 'var(--primary)'}}>77% over your 100-attendee goal</span>, with a 78.5% show-rate and 4.6 / 5 average rating.
                </div>
                <div style={{fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.55, maxWidth: 540}}>
                  3 follow-ups remain: feedback collection (24% response rate), prize disbursement, equipment return.
                </div>
              </div>
              <div style={{transform: 'rotate(2deg)', filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.12))'}}>
                <PosterPlaceholder w={140} h={195}/>
              </div>
            </div>

            {/* Scoreboard — expected vs actual */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 14,
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', overflow: 'hidden',
            }}>
              {[
                {k: 'Registrations', v: '177', expect: 'expected 100', delta: '+77%', tone: 'primary', explain: 'Final-week acceleration drove most of the overage.'},
                {k: 'Showed up', v: '139', expect: 'of 177 registered', delta: '78.5%', tone: 'primary', explain: 'Above the 65% campus average for free events.'},
                {k: 'Avg. rating', v: '4.6', expect: '/ 5 · 42 responses', delta: 'top quartile', tone: 'primary', explain: 'Highest praise: structure of the prize tracks.'},
                {k: 'NPS', v: '+58', expect: '24% response rate', delta: 'collect more', tone: 'warn', explain: 'Confidence interval is wide. Send a follow-up?'},
              ].map((s, i) => (
                <div key={i} style={{padding: '22px 24px', borderRight: i < 3 ? '1px solid var(--line)' : 'none'}}>
                  <div className="mono" style={{fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14}}>{s.k}</div>
                  <div style={{display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4}}>
                    <div className="display" style={{fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1}}>{s.v}</div>
                    <div style={{
                      fontSize: 11, fontWeight: 500,
                      color: s.tone === 'warn' ? 'var(--warn)' : 'var(--primary)',
                      background: s.tone === 'warn' ? 'var(--warn-soft)' : 'var(--primary-tint)',
                      padding: '3px 7px', borderRadius: 4,
                    }}>{s.delta}</div>
                  </div>
                  <div style={{fontSize: 12, color: 'var(--ink-3)', marginBottom: 8}}>{s.expect}</div>
                  <div style={{fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, fontStyle: 'italic'}}>{s.explain}</div>
                </div>
              ))}
            </div>

            {/* Voices + Wrap-up */}
            <div style={{display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16}}>
              <div style={{background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 14, padding: '22px 26px'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16}}>
                  <h3 className="display" style={{margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em'}}>What attendees said</h3>
                  <button style={{fontSize: 11.5, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer'}}>42 responses →</button>
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                  {[
                    {pct: 71, label: 'Prize structure was motivating', tone: 'good'},
                    {pct: 64, label: 'Mentor availability was excellent', tone: 'good'},
                    {pct: 38, label: 'Wished for longer build time', tone: 'mixed'},
                    {pct: 21, label: 'Lunch logistics were confusing', tone: 'bad'},
                  ].map((th, i) => (
                    <div key={i}>
                      <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5, color: 'var(--ink-2)'}}>
                        <span>{th.label}</span>
                        <span className="mono" style={{color: 'var(--ink-3)'}}>{th.pct}%</span>
                      </div>
                      <div style={{height: 5, background: 'var(--bg-soft)', borderRadius: 2, overflow: 'hidden'}}>
                        <div style={{width: `${th.pct}%`, height: '100%', background: th.tone === 'bad' ? 'var(--warn)' : th.tone === 'mixed' ? '#c4a44a' : 'var(--primary)'}}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 14, padding: '22px 24px'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16}}>
                  <h3 className="display" style={{margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em'}}>Wrap-up</h3>
                  <span className="mono" style={{fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.06em'}}>3 OPEN</span>
                </div>
                {[
                  {tag: 'COLLECT', body: 'Send feedback follow-up to the 135 silent attendees.', cta: 'Send', primary: true},
                  {tag: 'DISBURSE', body: '$5,000 prize awaiting confirmation for winning team.', cta: 'Confirm'},
                  {tag: 'RETURN', body: 'Equipment return to facilities — 3 items outstanding.', cta: 'Mark done'},
                ].map((it, i) => (
                  <div key={i} style={{
                    border: '1px solid', borderColor: it.primary ? 'var(--primary-soft)' : 'var(--line-2)',
                    background: it.primary ? 'var(--primary-tint)' : 'transparent',
                    borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                  }}>
                    <div className="mono" style={{fontSize: 9.5, fontWeight: 600, color: it.primary ? 'var(--primary)' : 'var(--ink-3)', letterSpacing: '0.08em', marginBottom: 4}}>{it.tag}</div>
                    <div style={{fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45, marginBottom: 8}}>{it.body}</div>
                    <button style={{
                      fontSize: 11.5, fontWeight: 600,
                      color: it.primary ? 'white' : 'var(--ink)',
                      background: it.primary ? 'var(--primary)' : 'var(--bg-card)',
                      border: it.primary ? 'none' : '1px solid var(--line)',
                      padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                    }}>{it.cta} →</button>
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

window.StateConcluded = StateConcluded;
