/* Diagnosis card — the four lifecycle states and the design problem of each */
function Diagnosis() {
  const states = [
    {
      n: '01', tag: 'JUST CREATED', title: 'Empty event',
      problem: 'A blank shell. The user has a name and not much else. Today\'s dashboard hides the gaps inside tab navigation — they have to click around to discover what\'s missing.',
      goal: 'Make the next setup step obvious, and the second one too. Defer everything else until it earns its place.',
      tone: 'neutral',
    },
    {
      n: '02', tag: 'PREPARING', title: 'Before the event',
      problem: 'Foundations are done. Now it\'s outreach, tasks, and last-mile prep. Today\'s dashboard treats Mar 14 the same whether it\'s 30 days out or 30 hours out — no urgency, no time-aware cues.',
      goal: 'A countdown view. What needs to happen this week, what\'s blocked, what\'s been sent.',
      tone: 'work',
    },
    {
      n: '03', tag: 'LIVE', title: 'During the event',
      problem: 'The current dashboard is a planning tool. On the day-of, organizers need a different surface entirely: check-in pace, capacity, mid-event announcements, ops issues — not a Registrations chart.',
      goal: 'A live operations console. Big numbers, fast actions, almost no chrome.',
      tone: 'live',
    },
    {
      n: '04', tag: 'CONCLUDED', title: 'Post-mortem',
      problem: 'The event is over but the chrome still pushes "Send announcement" and "Preview". The post-mortem is hidden behind a banner CTA.',
      goal: 'Pivot to retrospective: outcome vs. expectation, what attendees said, what tasks remain to close out.',
      tone: 'past',
    },
  ];
  return (
    <div style={{padding: '40px 48px', fontFamily: 'Inter, sans-serif', color: 'var(--ink)', background: 'var(--bg)', height: '100%', overflow: 'auto'}}>
      <div style={{display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 8, flexWrap: 'wrap'}}>
        <div className="display" style={{fontSize: 56, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em'}}>Four dashboards, not one</div>
      </div>
      <div style={{color: 'var(--ink-3)', fontSize: 16, maxWidth: 720, lineHeight: 1.5, marginBottom: 36}}>
        The EventDashboard tries to be the same surface across the entire lifecycle of an event. That's the root of the decision fatigue, density, and lack of focus — a "just-created" event and a "post-mortem" event have nothing in common except the data model — they should look like different products.
      </div>

      {/* Lifecycle bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
        marginBottom: 36,
        background: 'var(--bg-card)',
        border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden',
      }}>
        {states.map((s, i) => (
          <div key={s.n} style={{
            padding: '22px 24px',
            borderRight: i < 3 ? '1px solid var(--line)' : 'none',
            position: 'relative',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
            }}>
              <div className="mono" style={{
                fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.08em',
              }}>{s.n}</div>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: s.tone === 'live' ? '#c4533a' : s.tone === 'work' ? 'var(--primary)' : s.tone === 'past' ? 'var(--ink-4)' : 'var(--ink-3)',
              }}/>
            </div>
            <div className="mono" style={{fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.1em', marginBottom: 6}}>{s.tag}</div>
            <div className="display" style={{fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', marginBottom: 10}}>{s.title}</div>
            <div style={{fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55, marginBottom: 10}}>{s.problem}</div>
            <div style={{
              fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5,
              fontStyle: 'italic',
              borderTop: '1px solid var(--line-2)', paddingTop: 10,
            }}>→ {s.goal}</div>
          </div>
        ))}
      </div>

      {/* Recurring flaws — what every state inherits */}
      <div className="display" style={{fontSize: 26, fontWeight: 500, marginBottom: 14, letterSpacing: '-0.01em'}}>What every state should fix</div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16}}>
        {[
          {tag: 'Tabs → workspace', body: '9 horizontal tabs become a 6-item workspace rail with counts. Same areas, less competition.'},
          {tag: 'Header → status-aware', body: 'The big block of CTAs is a function of state. A new event needs "Publish"; a live event needs "Open check-in"; a concluded event needs "Generate post-mortem".'},
          {tag: 'One primary, always', body: 'There is exactly one primary action per state, surfaced in a single dedicated zone — not five buttons in a top-right cluster.'},
        ].map((f, i) => (
          <div key={i} style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '16px 18px',
          }}>
            <div className="mono" style={{
              fontSize: 10.5, color: 'var(--primary)', letterSpacing: '0.06em',
              textTransform: 'uppercase', fontWeight: 500, marginBottom: 8,
            }}>{f.tag}</div>
            <div style={{fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5}}>{f.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
window.Diagnosis = Diagnosis;
