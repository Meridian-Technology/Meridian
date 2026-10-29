const { createLiveEngine, checkLiveName, livePoints } = require('../../services/justGoLive/liveEngine');
const { parseLiveEventDefinition } = require('../../services/justGoLive/liveEventDefinition');

const CARD = {
  eventId: 'underground-6',
  title: 'underground pro-wrestling 6',
  accent: '#04FF16',
  matches: [
    {
      id: 'm1',
      title: 'rex vs. vega',
      sides: [
        { id: 'rex', name: 'Rex Rampage', color: '#FF4F1F' },
        { id: 'vega', name: 'Vega Storm', color: '#4AB5FF' },
      ],
    },
    {
      id: 'm2',
      title: 'triple threat',
      sides: [
        { id: 'ace', name: 'Ace High' },
        { id: 'bo', name: 'Bo Diddley' },
        { id: 'cy', name: 'Cy Young' },
      ],
    },
  ],
};

function setup({ isProfane = () => false } = {}) {
  const clock = { now: Date.parse('2026-10-30T20:00:00.000Z') };
  const { definition } = parseLiveEventDefinition(CARD);
  const engine = createLiveEngine({ definition, now: () => clock.now, isProfane });
  let n = 0;
  const run = (type, extra = {}) => {
    n += 1;
    return engine.command({ commandId: `c${n}`, type, ...extra });
  };
  const call = (deviceId, sideId, stageId = 'm1') => engine.handle(deviceId, { type: 'call', ref: `r-${deviceId}-${sideId}`, stageId, sideId });
  const advance = (ms) => {
    clock.now += ms;
    return engine.tick();
  };
  return { engine, clock, run, call, advance };
}

describe('parseLiveEventDefinition', () => {
  it('accepts a card and trims what the phones would drop', () => {
    const { definition, errors } = parseLiveEventDefinition({
      ...CARD,
      junk: true,
      intro: { layout: 'poster', imageUrl: 'http://insecure.example/x.png', cta: 'step in' },
    });
    expect(errors).toBeUndefined();
    expect(definition.junk).toBeUndefined();
    expect(definition.intro).toEqual({ layout: 'poster', cta: 'step in' });
    expect(definition.matches[1].sides).toHaveLength(3);
  });

  it('refuses a card it can’t run, with every reason', () => {
    const { errors } = parseLiveEventDefinition({
      eventId: 'demo',
      matches: [{ id: 'm1', title: 'solo', sides: [{ id: 'a', name: 'A' }] }],
    });
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/demo/),
      'title is required',
      expect.stringMatching(/2 to 4 sides/),
    ]));
  });
});

describe('checkLiveName', () => {
  it('tidies a name and refuses links and anything the filter catches', () => {
    expect(checkLiveName('  big   tony ')).toEqual({ ok: true, name: 'big tony' });
    expect(checkLiveName('a​b')).toEqual({ ok: true, name: 'ab' });
    expect(checkLiveName('').ok).toBe(false);
    expect(checkLiveName('my.site.com').ok).toBe(false);
    expect(checkLiveName('@handle').ok).toBe(false);
    expect(checkLiveName('rude', (text) => text === 'rude')).toEqual({
      ok: false,
      message: 'keep it friendly. try another name.',
    });
  });
});

describe('createLiveEngine', () => {
  it('opens on the doors: no stage, the first match up next, a name prompt for the clip', () => {
    const { engine } = setup();
    engine.join('clip-1', { surface: 'clip' });
    engine.join('app-1', { surface: 'app', name: 'Maya' });
    const clip = engine.snapshot('clip-1', { feed: true });
    expect(clip.stage).toBeNull();
    expect(clip.upNext.map((stage) => stage.id)).toEqual(['m1']);
    expect(clip.notice.title).toBe('doors are open');
    expect(clip.prompt.id).toBe('name');
    expect(clip.serverTime).toBe('2026-10-30T20:00:00.000Z');
    expect(engine.snapshot('app-1').prompt).toBeNull();
    expect(engine.snapshot('app-1').you.name).toBe('Maya');
  });

  it('refuses picks until they open, then takes and switches them before the bell', () => {
    const { engine, run, call } = setup();
    engine.join('a', { surface: 'clip' });
    expect(call('a', 'rex').ack).toMatchObject({ ok: false, message: 'picks open soon' });
    expect(run('open', { matchId: 'm1', bellInS: 300 })).toEqual({ ok: true });
    const stage = engine.snapshot('a').stage;
    expect(stage).toMatchObject({ id: 'm1', status: 'upcoming', callable: true });
    expect(stage.countdownTo).toBe('2026-10-30T20:05:00.000Z');
    // No picks yet: an even split.
    expect(stage.sides.map((side) => side.share)).toEqual([0.5, 0.5]);

    expect(call('a', 'rex')).toEqual({ ack: { ref: 'r-a-rex', ok: true }, fanChanged: true });
    expect(call('a', 'vega').fanChanged).toBe(true);
    expect(engine.snapshot('a').you.calls.m1.sideId).toBe('vega');
    expect(engine.drainFeed().map((item) => item.kind)).toEqual(['pick', 'switch']);
  });

  it('freezes the odds at the bell and pays underdogs more', () => {
    const { engine, run, call } = setup();
    for (const id of ['a', 'b', 'c', 'd']) engine.join(id, { surface: 'clip' });
    run('open', { matchId: 'm1' });
    call('a', 'rex');
    call('b', 'rex');
    call('c', 'rex');
    call('d', 'vega');
    const bell = run('bell');
    expect(bell.moment.headline).toBe('ding ding');
    expect(call('a', 'vega').ack).toMatchObject({ ok: false, message: 'picks lock at the bell' });

    // (3+1)/(4+2) and (1+1)/(4+2).
    const vegaShare = 2 / 6;
    expect(run('winner', { sideId: 'vega', how: 'by pin' }).moment.headline).toBe('vega wins');
    const d = engine.snapshot('d');
    expect(d.stage).toMatchObject({ status: 'settled', winnerId: 'vega', resultLabel: 'vega storm by pin.' });
    expect(d.you.calls.m1).toMatchObject({ outcome: 'won', points: livePoints(vegaShare) });
    expect(d.you.score).toBe(`${livePoints(vegaShare)} pts`);
    expect(d.you.rank).toBe('#1 of 4');
    expect(engine.snapshot('a').you.calls.m1).toMatchObject({ outcome: 'lost', points: 0 });
    expect(d.board.rows[0]).toMatchObject({ rank: '1', value: String(livePoints(vegaShare)), highlight: true });
  });

  it('voids picks on a no contest', () => {
    const { engine, run, call } = setup();
    engine.join('a', { surface: 'clip' });
    run('open', { matchId: 'm1' });
    call('a', 'rex');
    run('bell');
    run('noContest');
    const snapshot = engine.snapshot('a');
    expect(snapshot.stage.winnerId).toBeNull();
    expect(snapshot.you.calls.m1.outcome).toBe('void');
    expect(snapshot.you.score).toBe('0 pts');
  });

  it('moves the rope toward the corner whose fans tap harder per fan', () => {
    const { engine, run, call, advance } = setup();
    for (const id of ['r1', 'r2', 'r3', 'v1']) engine.join(id, { surface: 'clip' });
    run('open', { matchId: 'm1' });
    ['r1', 'r2', 'r3'].forEach((id) => call(id, 'rex'));
    call('v1', 'vega');
    run('bell');
    for (let i = 0; i < 12; i += 1) {
      advance(250);
      ['r1', 'r2', 'r3'].forEach((id) => engine.handle(id, { type: 'cheer', stageId: 'm1', sideId: 'rex', taps: 1 }));
      engine.handle('v1', { type: 'cheer', stageId: 'm1', sideId: 'vega', taps: 2 });
    }
    // One loud vega fan beats three steady rex fans: positive is the second side.
    expect(engine.snapshot('v1').stage.rope.position).toBeGreaterThan(0.2);
    expect(engine.snapshot('v1').you.cheering).toEqual({ m1: 'vega' });
  });

  it('caps how fast one phone counts', () => {
    const { engine, run, advance } = setup();
    engine.join('a', { surface: 'clip' });
    run('open', { matchId: 'm1' });
    run('bell');
    advance(1000);
    engine.handle('a', { type: 'cheer', stageId: 'm1', sideId: 'rex', taps: 500 });
    advance(250);
    engine.handle('a', { type: 'cheer', stageId: 'm1', sideId: 'rex', taps: 500 });
    advance(250);
    const top = engine.snapshot('a').stage.sides[0].topFan;
    // A first batch banks at most a second (8), then 250 ms earns 2.
    expect(top.value).toBe('10 cheers');
  });

  it('knocks a fighter out of a triple threat and moves their fans', () => {
    const { engine, run, call, advance } = setup();
    engine.join('a', { surface: 'clip' });
    run('open', { matchId: 'm1' });
    run('bell');
    run('winner', { sideId: 'rex' });
    run('open', { matchId: 'm2' });
    call('a', 'ace', 'm2');
    run('bell');
    expect(run('out', { sideId: 'ace' }).moment.headline).toBe('ace is out');
    let snapshot = engine.snapshot('a');
    expect(snapshot.stage.sides.map((side) => side.out === true)).toEqual([true, false, false]);
    expect(snapshot.stage.sides[0].momentum).toBe(0);
    expect(snapshot.you.cheering).toEqual({});
    expect(run('out', { sideId: 'bo' })).toEqual({ ok: false, message: 'two left: call the winner' });
    expect(run('winner', { sideId: 'ace' })).toEqual({ ok: false, message: 'that corner is out' });

    // Cheers for the fighter who's out don't count; another corner does.
    advance(1000);
    engine.handle('a', { type: 'cheer', stageId: 'm2', sideId: 'ace', taps: 3 });
    expect(engine.snapshot('a').you.cheering).toEqual({});
    engine.handle('a', { type: 'cheer', stageId: 'm2', sideId: 'cy', taps: 3 });
    snapshot = engine.snapshot('a');
    expect(snapshot.you.cheering).toEqual({ m2: 'cy' });

    run('winner', { sideId: 'bo' });
    expect(engine.snapshot('a').you.calls.m2.outcome).toBe('lost');
  });

  it('applies a command id once and undoes the last call within a minute', () => {
    const { engine, run, call, clock } = setup();
    engine.join('a', { surface: 'clip' });
    run('open', { matchId: 'm1' });
    call('a', 'rex');
    run('bell');
    expect(engine.command({ commandId: 'w', type: 'winner', sideId: 'vega' }).ok).toBe(true);
    expect(engine.command({ commandId: 'w', type: 'winner', sideId: 'rex' })).toEqual({ ok: true, duplicate: true });
    expect(engine.snapshot('a').stage.winnerId).toBe('vega');

    expect(run('undo')).toEqual({ ok: true, undone: 'winner' });
    expect(engine.snapshot('a').stage.status).toBe('open');
    expect(run('winner', { sideId: 'rex' }).ok).toBe(true);
    expect(engine.snapshot('a').you.calls.m1.outcome).toBe('won');

    clock.now += 61 * 1000;
    expect(run('undo')).toEqual({ ok: false, message: 'nothing to undo' });
  });

  it('never reuses a moment id after an undo, so the redone call still plays', () => {
    const { run } = setup();
    run('open', { matchId: 'm1' });
    run('bell');
    const first = run('winner', { sideId: 'vega' }).moment.id;
    run('undo');
    const second = run('winner', { sideId: 'rex' }).moment.id;
    expect(second).not.toBe(first);
  });

  it('ends the night: the clip asks for the install, the app says done', () => {
    const { engine, run } = setup();
    engine.join('clip', { surface: 'clip' });
    engine.join('app', { surface: 'app', name: 'Sam' });
    run('open', { matchId: 'm1' });
    expect(run('end')).toEqual({ ok: false, message: 'call the match on stage first' });
    run('noContest');
    run('end');
    expect(engine.snapshot('clip')).toMatchObject({ ended: true, upNext: [], cta: { kind: 'install' } });
    expect(engine.snapshot('app').cta).toMatchObject({ kind: 'close' });
  });

  it('refuses names the room shouldn’t see, and never shows device ids', () => {
    const { engine, run, call } = setup({ isProfane: (text) => /rude/.test(text) });
    engine.join('device-secret-1', { surface: 'clip' });
    engine.join('device-secret-2', { surface: 'app', name: 'rude dude' });
    expect(engine.snapshot('device-secret-2').prompt.id).toBe('name');
    expect(engine.handle('device-secret-1', { type: 'action', ref: 'n', actionId: 'name', value: 'rude' }).ack.ok).toBe(false);
    expect(engine.handle('device-secret-1', { type: 'action', ref: 'n', actionId: 'name', value: 'Lu' }).ack.ok).toBe(true);
    run('open', { matchId: 'm1' });
    call('device-secret-1', 'rex');
    call('device-secret-2', 'rex');
    run('bell');
    run('winner', { sideId: 'rex' });
    const text = JSON.stringify([engine.snapshot('device-secret-1', { feed: true }), engine.drainFeed()]);
    expect(text).not.toMatch(/device-secret-2/);
    expect(text).toMatch(/"label":"Lu"/);
  });

  it('picks up where it left off from what was stored', () => {
    const first = setup();
    first.engine.join('a', { surface: 'clip' });
    first.engine.join('b', { surface: 'clip' });
    first.run('open', { matchId: 'm1' });
    first.call('a', 'rex');
    first.call('b', 'vega');
    first.run('bell');
    first.run('winner', { sideId: 'rex' });

    const restarted = createLiveEngine({
      definition: first.engine.definition,
      state: first.engine.exportState(),
      fans: [first.engine.exportFan('a'), first.engine.exportFan('b')],
      now: () => first.clock.now,
      isProfane: () => false,
    });
    expect(restarted.snapshot('a').you).toMatchObject({ score: first.engine.snapshot('a').you.score, rank: '#1 of 2' });
    expect(restarted.snapshot('a').stage.winnerId).toBe('rex');
    expect(restarted.snapshot('a').upNext.map((stage) => stage.id)).toEqual(['m2']);
  });
});
