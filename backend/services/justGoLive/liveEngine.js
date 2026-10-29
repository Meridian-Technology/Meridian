const { isProfane: defaultIsProfane } = require('../profanityFilterService');

/**
 * One Just Go Live night, in memory: the card, what the spotter has called,
 * and every fan's picks and cheers. It speaks the app's live protocol
 * (`Meridian-Mobile/src/live/liveProtocol.ts`), and behaves like the app's
 * demo engine (`liveDemoEngine.ts`), except that a spotter rings the bell
 * and calls the winner instead of a script.
 *
 * Before the bell fans pick a corner, and the pick split is the room's odds:
 * the less the room believed, the more a right pick scores. From the bell
 * they tap to cheer; the rope (two corners) or the momentum bands (three or
 * four) compare taps per fan, so a small loud corner can beat a big quiet
 * one. Cheers never score.
 *
 * Pure: no I/O and no timers. `liveHub` owns sockets, the clock and storage.
 * Scores are derived from picks and results, so undoing a call needs no
 * repair. Device ids identify fans and are never sent to other phones.
 */

const SHARE_MIN = 0.04;
const SHARE_MAX = 0.96;
/** Taps per second a phone is allowed to count, and how much it can bank. */
const MAX_TAPS_PER_S = 8;
const MAX_TAP_BANK_S = 3;
/** How far apart per-fan tap rates have to be to pin the rope at an end. */
const ROPE_GAIN = 2.4;
/** The rope eases toward its target this fast (per second). */
const ROPE_EASE = 1.6;
/** The crowd meter reads taps from this far back. */
const CROWD_WINDOW_MS = 3000;
/** The displayed odds move with the crowd by at most this much. */
const ODDS_NUDGE = 0.1;
/** The rope must lead by this much before a new leader is announced. */
const LEAD_CALL = 0.18;
const LEAD_CALL_GAP_MS = 6000;
/** A new #1 fan has to be this many cheers clear of the holder. */
const TOP_FAN_MARGIN = 3;
const CHEER_MILESTONES = [50, 100, 200, 400];
/** Recent activity a joining or polling phone gets. */
const FEED_LOG_SIZE = 30;
/** A phone shows a row every ~420 ms; more than this per batch is noise. */
const FEED_BATCH_MAX = 6;
const BOARD_ROWS = 8;
const NAME_MAX = 24;
const DEFAULT_SURGE_S = 20;
const UNDO_WINDOW_MS = 60 * 1000;
const UNDO_DEPTH = 10;
const REMEMBERED_COMMANDS = 200;
const POLL_MS = 2500;

const HAPTICS = {
  bell: [
    { atMs: 0, style: 'heavy' },
    { atMs: 180, style: 'heavy' },
    { atMs: 360, style: 'rigid' },
  ],
  surge: [
    { atMs: 0, style: 'heavy' },
    { atMs: 120, style: 'rigid' },
    { atMs: 260, style: 'heavy' },
  ],
  win: [
    { atMs: 0, style: 'success' },
    { atMs: 260, style: 'heavy' },
  ],
  out: [
    { atMs: 0, style: 'heavy' },
    { atMs: 200, style: 'rigid' },
  ],
};

const SURGE_YELLOW = '#FFD23F';

const NAME_PROMPT = Object.freeze({
  id: 'name',
  title: 'what should the board call you?',
  placeholder: 'your name',
  submitLabel: 'that’s me',
  maxLength: NAME_MAX,
});

const FEATURES = ['chat', 'topFan', 'moments', 'install'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampShare(share) {
  return clamp(share, SHARE_MIN, SHARE_MAX);
}

function normalize(values) {
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return values.map((value) => value / total);
}

function pct(share) {
  return `${Math.round(share * 100)}%`;
}

/** `Vega Storm` → `vega`. */
function first(side) {
  return String(side.name).trim().split(/\s+/)[0].toLowerCase();
}

/** Points for a right pick: the less the room believed, the more it pays. */
function livePoints(share) {
  return Math.round(100 / clampShare(share));
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function iso(ms) {
  return new Date(ms).toISOString();
}

/**
 * A fan's chosen name, tidied, or why it won't do. The board and the feed
 * show it to the whole room, so it goes through the profanity filter and
 * can't carry a link.
 */
function checkLiveName(raw, isProfane = defaultIsProfane) {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  if (!name) return { ok: false, message: 'type a name first.' };
  if (/https?:|www\.|\.(com|net|org|io|gg|co|xyz|ly)\b|@/i.test(name)) {
    return { ok: false, message: 'just a name, no links.' };
  }
  let profane = false;
  try {
    profane = isProfane(name);
  } catch {
    profane = false;
  }
  if (profane) return { ok: false, message: 'keep it friendly. try another name.' };
  return { ok: true, name };
}

/** The spotter's side of the night, as stored. */
function emptyLiveState() {
  return {
    stageMatchId: null,
    status: null,
    /** ISO: the bell countdown on the pick screen (optional). */
    bellAt: null,
    /** ISO: when the next match's picks open, for the lobby (optional). */
    opensAt: null,
    /** matchId → {winnerId (null: no contest), how, at}. */
    results: {},
    /** matchId → {sideId: share}, frozen at the bell: the odds picks pay at. */
    bellShares: {},
    /** matchId → side ids knocked out of a 3–4 corner match. */
    out: {},
    surgeUntil: null,
    notice: null,
    hold: null,
    redirect: null,
    features: {},
    tuning: null,
    ended: false,
    lastMoment: null,
    momentCount: 0,
    commandIds: [],
    history: [],
  };
}

/**
 * @param {object} options
 * @param {object} options.definition - a card from `parseLiveEventDefinition`
 * @param {object} [options.state] - the stored spotter state
 * @param {object[]} [options.fans] - stored fans: {deviceId, name, surface, source, calls, joinedAt}
 * @param {() => number} [options.now]
 * @param {(text: string) => boolean} [options.isProfane]
 */
function createLiveEngine({
  definition,
  state: storedState,
  fans: storedFans = [],
  now = Date.now,
  isProfane = defaultIsProfane,
}) {
  let card = definition;
  const state = { ...emptyLiveState(), ...clone(storedState || {}) };

  /** deviceId → fan. Runtime fields (cheers) are never stored. */
  const fans = new Map();
  for (const stored of storedFans) {
    if (!stored?.deviceId) continue;
    fans.set(stored.deviceId, {
      deviceId: stored.deviceId,
      name: stored.name || undefined,
      surface: stored.surface === 'app' ? 'app' : 'clip',
      source: stored.source || undefined,
      calls: { ...(stored.calls || {}) },
      joinedAt: stored.joinedAt ? new Date(stored.joinedAt).getTime() : now(),
      cheering: new Map(),
      lastCheerAt: 0,
    });
  }

  // The current match's crowd: reset whenever another match takes the stage.
  let crowdMatchId = null;
  let rope = 0;
  let momentum = [];
  /** Per side: recent counted taps, `{at, deviceId, taps}`. */
  let windows = [];
  /** Per side: per-fan cheers a second, for the rope's labels. */
  let rates = [];
  /** sideId → Map(deviceId → cheers this match), for #1 fans and milestones. */
  let cheerCounts = new Map();
  /** sideId → deviceId holding #1. */
  let topHolder = new Map();
  let leader = null;
  let leaderCalledAt = 0;
  let lastTickAt = now();

  let feedCount = 0;
  // Phones drop feed ids they've seen; a restarted process mustn't reuse them.
  const feedPrefix = now().toString(36);
  let pendingFeed = [];
  const feedLog = [];
  let seq = 0;

  let rankingDirty = true;
  let ranking = { rows: [], rankOf: new Map(), scoreOf: new Map() };

  const matches = () => card.matches;
  const matchById = (matchId) => card.matches.find((match) => match.id === matchId) || null;
  const stageMatch = () => (state.stageMatchId ? matchById(state.stageMatchId) : null);
  const sideIndex = (match, sideId) => match.sides.findIndex((side) => side.id === sideId);
  const outOf = (matchId) => new Set(state.out[matchId] || []);

  // --- Picks and odds ------------------------------------------------------

  function pickCounts(match) {
    const counts = match.sides.map(() => 0);
    for (const fan of fans.values()) {
      const index = sideIndex(match, fan.calls[match.id]);
      if (index >= 0) counts[index] += 1;
    }
    return counts;
  }

  /** The live split before the bell, smoothed so one pick isn't 100%. */
  function pickShares(match) {
    const counts = pickCounts(match);
    const total = counts.reduce((sum, count) => sum + count, 0);
    const n = match.sides.length;
    const raw = counts.map((count) => (count + 1) / (total + n));
    if (n === 2) {
      const a = clampShare(raw[0]);
      return [a, 1 - a];
    }
    return normalize(raw.map(clampShare));
  }

  /** The odds a pick pays at: live before the bell, frozen at it. */
  function oddsShares(match) {
    const frozen = state.bellShares[match.id];
    if (frozen) return match.sides.map((side) => frozen[side.id] ?? 1 / match.sides.length);
    return pickShares(match);
  }

  /** What the screens show: the odds, nudged a little by the crowd. */
  function shownShares(match) {
    const odds = oddsShares(match);
    if (!state.bellShares[match.id] || match.id !== crowdMatchId) return odds;
    if (odds.length === 2) {
      const a = clampShare(odds[0] - rope * ODDS_NUDGE);
      return [a, 1 - a];
    }
    const out = outOf(match.id);
    const active = match.sides.filter((side) => !out.has(side.id)).length || 1;
    const even = 1 / active;
    return normalize(odds.map((share, index) => (out.has(match.sides[index].id)
      ? share
      : clampShare(share + ((momentum[index] ?? even) - even) * 2 * ODDS_NUDGE))));
  }

  // --- Feed and moments ----------------------------------------------------

  function post(item) {
    feedCount += 1;
    const entry = { id: `${feedPrefix}.${feedCount}`, at: iso(now()), ...item };
    pendingFeed.push(entry);
    feedLog.push(entry);
    if (feedLog.length > FEED_LOG_SIZE) feedLog.shift();
  }

  function raise(moment) {
    state.momentCount += 1;
    state.lastMoment = {
      ...moment,
      id: `${card.eventId}:${state.momentCount}`,
      at: iso(now()),
    };
    return state.lastMoment;
  }

  // --- The crowd -----------------------------------------------------------

  function resetCrowd(match) {
    crowdMatchId = match ? match.id : null;
    const count = match ? match.sides.length : 0;
    rope = 0;
    momentum = Array.from({ length: count }, () => 1 / (count || 1));
    windows = Array.from({ length: count }, () => []);
    rates = Array.from({ length: count }, () => 0);
    cheerCounts = new Map((match ? match.sides : []).map((side) => [side.id, new Map()]));
    topHolder = new Map();
    leader = null;
    leaderCalledAt = 0;
    for (const fan of fans.values()) fan.cheering.delete(crowdMatchId);
  }

  function ensureCrowd() {
    const match = stageMatch();
    if ((match ? match.id : null) !== crowdMatchId) resetCrowd(match);
    return match;
  }

  function surging(at = now()) {
    return Boolean(state.surgeUntil) && at < Date.parse(state.surgeUntil);
  }

  /** Which corner is loudest, if clearly so. */
  function loudest(match, margin) {
    if (match.sides.length === 2) {
      if (Math.abs(rope) < margin) return null;
      return rope < 0 ? 0 : 1;
    }
    const ranked = momentum
      .map((value, index) => ({ value, index }))
      .sort((a, b) => b.value - a.value);
    if (ranked.length < 2 || ranked[0].value - ranked[1].value < margin / 2) return null;
    return ranked[0].index;
  }

  function stepCrowd(match, at, elapsedS) {
    const out = outOf(match.id);
    const cutoff = at - CROWD_WINDOW_MS;
    const per = match.sides.map((side, index) => {
      windows[index] = windows[index].filter((entry) => entry.at >= cutoff);
      const taps = windows[index].reduce((sum, entry) => sum + entry.taps, 0);
      const crowd = new Set(windows[index].map((entry) => entry.deviceId)).size;
      rates[index] = crowd ? taps / crowd / (CROWD_WINDOW_MS / 1000) : 0;
      return crowd ? taps / crowd : 0;
    });
    const gain = ROPE_GAIN * (surging(at) ? 2 : 1);
    const ease = Math.min(1, elapsedS * ROPE_EASE);

    if (match.sides.length === 2) {
      const total = per[0] + per[1];
      const target = total > 0 ? clamp(((per[1] - per[0]) / total) * gain, -1, 1) : 0;
      rope += (target - rope) * ease;
    } else {
      const active = match.sides.map((side, index) => index).filter((index) => !out.has(match.sides[index].id));
      const mean = active.reduce((sum, index) => sum + per[index], 0) / (active.length || 1);
      const raw = match.sides.map((side, index) => {
        if (out.has(side.id)) return 0;
        if (mean <= 0) return 1;
        return Math.exp(((per[index] - mean) / mean) * gain);
      });
      const target = normalize(raw);
      momentum = momentum.map((value, index) => (out.has(match.sides[index].id)
        ? 0
        : value + (target[index] - value) * ease));
      momentum = normalize(momentum);
    }

    const ahead = loudest(match, LEAD_CALL);
    if (ahead !== null && ahead !== leader && at - leaderCalledAt > LEAD_CALL_GAP_MS) {
      leader = ahead;
      leaderCalledAt = at;
      const side = match.sides[ahead];
      post({ who: `${first(side)}'s corner`, text: 'is louder now', sideId: side.id, kind: 'crowd' });
    }

    // #1 fans: a new holder has to be clearly ahead, so it doesn't flicker.
    for (const side of match.sides) {
      const counts = cheerCounts.get(side.id);
      if (!counts || !counts.size) continue;
      let best = null;
      for (const [deviceId, count] of counts) {
        if (!best || count > best.count) best = { deviceId, count };
      }
      const holder = topHolder.get(side.id);
      const holderCount = holder ? counts.get(holder) ?? 0 : 0;
      if (best && best.count >= 1 && best.deviceId !== holder
        && (!holder || best.count >= holderCount + TOP_FAN_MARGIN)) {
        topHolder.set(side.id, best.deviceId);
        const fan = fans.get(best.deviceId);
        post({
          who: fan?.name || 'a fan',
          text: `is #1 for ${first(side)}`,
          value: `${Math.floor(best.count)} cheers`,
          sideId: side.id,
          kind: 'crowd',
        });
      }
    }
  }

  function topFanOf(side) {
    const holder = topHolder.get(side.id);
    if (!holder) return null;
    const count = cheerCounts.get(side.id)?.get(holder) ?? 0;
    if (count < 1) return null;
    return { deviceId: holder, name: fans.get(holder)?.name || 'a fan', count };
  }

  // --- Scores and the board --------------------------------------------------

  function scoreOf(fan) {
    let score = 0;
    for (const match of matches()) {
      const result = state.results[match.id];
      const pick = fan.calls[match.id];
      if (!result || !result.winnerId || pick !== result.winnerId) continue;
      score += livePoints(oddsShares(match)[sideIndex(match, pick)]);
    }
    return score;
  }

  function rank() {
    if (!rankingDirty) return ranking;
    const rows = [...fans.values()]
      .map((fan) => ({ fan, score: scoreOf(fan) }))
      .sort((a, b) => b.score - a.score || a.fan.joinedAt - b.fan.joinedAt);
    ranking = {
      rows,
      rankOf: new Map(rows.map((row, index) => [row.fan.deviceId, index + 1])),
      scoreOf: new Map(rows.map((row) => [row.fan.deviceId, row.score])),
    };
    rankingDirty = false;
    return ranking;
  }

  // --- Snapshots -----------------------------------------------------------

  function plainSide(side) {
    return { ...side };
  }

  function stageFor(match) {
    const status = state.status;
    const result = state.results[match.id];
    const shares = shownShares(match);
    const out = outOf(match.id);
    const rung = status !== 'upcoming';
    const many = match.sides.length > 2;
    const sides = match.sides.map((side, index) => {
      const top = rung && match.id === crowdMatchId ? topFanOf(side) : null;
      return {
        ...plainSide(side),
        share: shares[index],
        ...(many && rung && match.id === crowdMatchId ? { momentum: momentum[index] ?? 0 } : {}),
        ...(out.has(side.id) ? { out: true } : {}),
        ...(top ? { topFan: { name: top.name, value: `${Math.floor(top.count)} cheers` } } : {}),
      };
    });
    const winner = result?.winnerId ? match.sides[sideIndex(match, result.winnerId)] : null;
    let ropeBlock;
    if (rung) {
      const surge = surging();
      const ropeLeader = loudest(match, 0.05);
      ropeBlock = {
        position: match.sides.length === 2 ? rope : 0,
        live: status === 'open',
        ...(match.sides.length === 2
          ? {
            firstLabel: `${rates[0]?.toFixed(1) ?? '0.0'} cheers/s each`,
            secondLabel: `${rates[1]?.toFixed(1) ?? '0.0'} cheers/s each`,
          }
          : {}),
        cta: 'cheer!',
        tapNudge: 0.012,
        surge: surge ? { label: 'surge · cheers count double', until: state.surgeUntil } : null,
        ...(status === 'settled'
          ? {
            result: ropeLeader !== null
              ? `${first(match.sides[ropeLeader])}'s fans were ${match.sides.length === 2 ? 'louder' : 'loudest'}.`
              : 'the crowd ended dead even.',
          }
          : {}),
      };
    }
    return {
      id: match.id,
      kicker: match.kicker || `match ${matches().indexOf(match) + 1}`,
      title: match.title,
      ...(match.detail ? { detail: match.detail } : {}),
      status,
      ...(status === 'upcoming' && state.bellAt ? { countdownTo: state.bellAt } : {}),
      callable: status === 'upcoming',
      ...(status === 'upcoming' ? { callPrompt: match.callPrompt || 'who takes it?' } : {}),
      sides,
      ...(status === 'settled' ? { winnerId: winner ? winner.id : null } : {}),
      ...(status === 'settled'
        ? { resultLabel: winner ? `${winner.name.toLowerCase()} ${result.how || 'wins'}.` : 'no contest. picks don’t count.' }
        : {}),
      ...(ropeBlock ? { rope: ropeBlock } : {}),
    };
  }

  /** The next match nobody has played yet, after the one on stage. */
  function nextMatch() {
    if (state.ended) return null;
    const list = matches();
    const from = state.stageMatchId ? list.findIndex((match) => match.id === state.stageMatchId) + 1 : 0;
    return list.slice(from).find((match) => !state.results[match.id]) || null;
  }

  function defaultNotice() {
    if (state.ended) return null;
    const match = stageMatch();
    if (!match && !Object.keys(state.results).length) {
      return {
        title: 'doors are open',
        body: 'when picks open, pick who wins. at the bell, tap to cheer your corner. underdogs score more points.',
        tone: 'hype',
      };
    }
    if (match && state.status === 'upcoming') {
      return { body: 'pick before the bell. you can switch until then.', tone: 'info' };
    }
    return null;
  }

  /** Everything every phone sees the same. */
  function shared({ feed = false } = {}) {
    const match = stageMatch();
    const next = nextMatch();
    seq = Math.max(seq + 1, now());
    return {
      v: 1,
      eventId: card.eventId,
      seq,
      serverTime: iso(now()),
      title: card.title,
      ...(card.kicker ? { kicker: card.kicker } : {}),
      ...(card.detail ? { detail: card.detail } : {}),
      ...(card.accent ? { accent: card.accent } : {}),
      stage: match ? stageFor(match) : null,
      upNext: next
        ? [{
          id: next.id,
          kicker: next.kicker || `match ${matches().indexOf(next) + 1}`,
          title: next.title,
          status: 'upcoming',
          ...(state.opensAt ? { countdownTo: state.opensAt } : {}),
          sides: next.sides.map(plainSide),
        }]
        : [],
      ...(state.ended ? { ended: true } : {}),
      notice: state.notice || defaultNotice(),
      intro: card.intro || null,
      ...(card.copy ? { copy: card.copy } : {}),
      hold: state.hold,
      redirect: state.redirect,
      features: state.features,
      ...(state.tuning ? { tuning: state.tuning } : {}),
      lastMoment: state.lastMoment,
      pollMs: POLL_MS,
      ...(feed ? { feed: feedLog.slice() } : {}),
    };
  }

  function callFor(fan, match) {
    const pick = fan.calls[match.id];
    const index = sideIndex(match, pick);
    if (index < 0) return null;
    const side = match.sides[index];
    const share = oddsShares(match)[index];
    const points = livePoints(share);
    const result = state.results[match.id];
    if (!result) {
      return {
        sideId: pick,
        label: state.bellShares[match.id]
          ? `picked at ${pct(share)} · worth ${points}`
          : `if ${first(side)} wins: +${points} pts · ${pct(share)} agree`,
      };
    }
    if (!result.winnerId) return { sideId: pick, label: 'no contest · picks don’t count', outcome: 'void' };
    const won = result.winnerId === pick;
    return {
      sideId: pick,
      label: won ? `picked at ${pct(share)} · +${points}` : `picked at ${pct(share)} · no points`,
      outcome: won ? 'won' : 'lost',
      points: won ? points : 0,
    };
  }

  /** What only this phone sees: its picks, rank, board row, name prompt. */
  function personal(deviceId) {
    const fan = fans.get(deviceId);
    const match = stageMatch();
    const { rows, rankOf, scoreOf: scores } = rank();
    const settledAny = Object.keys(state.results).length > 0;
    if (!fan) return { you: null, board: null, prompt: null, cta: null };

    const calls = {};
    for (const each of matches()) {
      const call = callFor(fan, each);
      if (call) calls[each.id] = call;
    }
    const cheering = {};
    const cheer = match ? fan.cheering.get(match.id) : undefined;
    if (cheer) cheering[match.id] = cheer;
    const cheerSide = match && cheer ? match.sides[sideIndex(match, cheer)] : null;
    const isTopFan = Boolean(cheerSide && state.status !== 'upcoming' && topHolder.get(cheerSide.id) === deviceId);

    const yourRank = rankOf.get(deviceId);
    const board = settledAny
      ? {
        title: 'leaderboard',
        rows: rows.slice(0, BOARD_ROWS).map((row, index) => ({
          id: `rank-${index + 1}`,
          rank: String(index + 1),
          label: row.fan.name || 'a fan',
          value: String(row.score),
          ...(row.fan.deviceId === deviceId ? { highlight: true } : {}),
        })),
      }
      : null;
    if (board && yourRank > BOARD_ROWS) {
      board.rows.push({
        id: `rank-${yourRank}`,
        rank: String(yourRank),
        label: fan.name || 'you',
        value: String(scores.get(deviceId) ?? 0),
        highlight: true,
      });
    }

    const pickedNow = match ? Boolean(fan.calls[match.id]) : false;
    return {
      you: {
        ...(fan.name ? { name: fan.name } : {}),
        ...(settledAny || match ? { score: `${scores.get(deviceId) ?? 0} pts` } : {}),
        ...(settledAny && yourRank ? { rank: `#${yourRank} of ${rows.length}` } : {}),
        ...(match && state.status === 'upcoming' && !pickedNow
          ? { line: 'call an underdog for more points. just for fun.' }
          : {}),
        calls,
        cheering,
        ...(isTopFan ? { isTopFan: true } : {}),
      },
      board,
      prompt: fan.name ? null : NAME_PROMPT,
      // The ask comes at the end: the clip's install, the app's done.
      cta: state.ended
        ? fan.surface === 'clip'
          ? { label: 'get just go', kind: 'install' }
          : { label: 'done', kind: 'close' }
        : null,
    };
  }

  // --- Fans ----------------------------------------------------------------

  function join(deviceId, { surface, name, source } = {}) {
    let fan = fans.get(deviceId);
    let changed = false;
    if (!fan) {
      fan = {
        deviceId,
        name: undefined,
        surface: surface === 'app' ? 'app' : 'clip',
        source: typeof source === 'string' ? source.slice(0, 64) : undefined,
        calls: {},
        joinedAt: now(),
        cheering: new Map(),
        lastCheerAt: 0,
      };
      fans.set(deviceId, fan);
      rankingDirty = true;
      changed = true;
    }
    if (surface && (surface === 'app' ? 'app' : 'clip') !== fan.surface) {
      fan.surface = surface === 'app' ? 'app' : 'clip';
      changed = true;
    }
    // The app's account name, when the fan hasn't picked one here.
    if (!fan.name && name) {
      const checked = checkLiveName(name, isProfane);
      if (checked.ok) {
        fan.name = checked.name;
        rankingDirty = true;
        changed = true;
      }
    }
    return { changed };
  }

  function call(fan, message) {
    const match = stageMatch();
    const refuse = (text) => ({ ack: { ref: message.ref, ok: false, message: text } });
    if (!match) return refuse('picks open soon');
    if (message.stageId !== match.id) return refuse('that match is over');
    if (state.status !== 'upcoming') return refuse('picks lock at the bell');
    const index = sideIndex(match, message.sideId);
    if (index < 0) return refuse('that match is over');
    const previous = fan.calls[match.id];
    if (previous === message.sideId) return { ack: { ref: message.ref, ok: true } };
    fan.calls[match.id] = message.sideId;
    rankingDirty = true;
    post({
      who: fan.name || 'a fan',
      text: `${previous ? 'switched to' : 'picked'} ${first(match.sides[index])}`,
      value: pct(pickShares(match)[index]),
      sideId: message.sideId,
      kind: previous ? 'switch' : 'pick',
    });
    return { ack: { ref: message.ref, ok: true }, fanChanged: true };
  }

  function cheer(fan, message) {
    const match = ensureCrowd();
    if (!match || message.stageId !== match.id || state.status !== 'open') return {};
    const out = outOf(match.id);
    const held = fan.cheering.get(match.id) ?? fan.calls[match.id];
    // A fan who skipped the pick, or whose fighter is out, chooses a corner
    // with their first tap.
    const keep = held !== undefined && !out.has(held) && sideIndex(match, held) >= 0 ? held : undefined;
    const sideId = keep ?? message.sideId;
    const index = sideIndex(match, sideId);
    if (index < 0 || out.has(sideId) || sideId !== message.sideId) return {};
    fan.cheering.set(match.id, sideId);

    const at = now();
    const elapsedS = fan.lastCheerAt ? (at - fan.lastCheerAt) / 1000 : 1;
    const allowed = Math.max(1, Math.ceil(Math.min(elapsedS, MAX_TAP_BANK_S) * MAX_TAPS_PER_S));
    fan.lastCheerAt = at;
    const taps = Math.min(Math.max(0, Math.floor(Number(message.taps) || 0)), allowed);
    if (!taps) return {};
    windows[index].push({ at, deviceId: fan.deviceId, taps });

    const counted = taps * (surging(at) ? 2 : 1);
    const counts = cheerCounts.get(sideId);
    const before = counts.get(fan.deviceId) ?? 0;
    counts.set(fan.deviceId, before + counted);
    const milestone = CHEER_MILESTONES.find((mark) => before < mark && before + counted >= mark);
    if (milestone) {
      post({ who: fan.name || 'a fan', text: `hit ${milestone} cheers`, value: `+${milestone}`, sideId, kind: 'combo' });
    }
    return {};
  }

  function action(fan, message) {
    if (message.actionId === 'name') {
      const checked = checkLiveName(message.value, isProfane);
      if (!checked.ok) return { ack: { ref: message.ref, ok: false, message: checked.message } };
      fan.name = checked.name;
      rankingDirty = true;
      return { ack: { ref: message.ref, ok: true }, fanChanged: true };
    }
    return { ack: { ref: message.ref, ok: false, message: 'not now' } };
  }

  /**
   * A fan's message. Returns `{ack, fanChanged}`: `ack` for messages with a
   * ref, `fanChanged` when the fan's stored record moved.
   */
  function handle(deviceId, message) {
    const fan = fans.get(deviceId);
    if (!message || typeof message !== 'object') return {};
    if (!fan) {
      return typeof message.ref === 'string'
        ? { ack: { ref: message.ref, ok: false, message: 'join first' } }
        : {};
    }
    switch (message.type) {
      case 'call':
        return typeof message.ref === 'string' ? call(fan, message) : {};
      case 'cheer':
        return cheer(fan, message);
      case 'action':
        return typeof message.ref === 'string' ? action(fan, message) : {};
      default:
        return {};
    }
  }

  // --- The spotter -----------------------------------------------------------

  const fail = (message) => ({ ok: false, message });

  function snapshotState() {
    const copy = clone(state);
    delete copy.history;
    delete copy.commandIds;
    return copy;
  }

  const COMMANDS = {
    /** Picks open for a match: it takes the stage. */
    open({ matchId, bellInS }) {
      const match = matchById(matchId);
      if (!match) return fail('no such match');
      if (state.ended) return fail('the night is over');
      if (state.results[match.id]) return fail('that match is already called');
      if (state.status === 'open' || state.status === 'locked') return fail('call the match on stage first');
      state.stageMatchId = match.id;
      state.status = 'upcoming';
      const bell = Number(bellInS);
      state.bellAt = Number.isFinite(bell) && bell > 0 ? iso(now() + bell * 1000) : null;
      state.opensAt = null;
      state.surgeUntil = null;
      ensureCrowd();
      return { ok: true };
    },
    /** Picks lock at the odds of the moment; cheering starts. */
    bell() {
      const match = stageMatch();
      if (!match || state.status !== 'upcoming') return fail('open picks first');
      const shares = pickShares(match);
      state.bellShares[match.id] = Object.fromEntries(match.sides.map((side, index) => [side.id, shares[index]]));
      state.status = 'open';
      state.bellAt = null;
      ensureCrowd();
      for (const fan of fans.values()) {
        const pick = fan.calls[match.id];
        if (pick) fan.cheering.set(match.id, pick);
      }
      rankingDirty = true;
      return {
        ok: true,
        moment: raise({ headline: 'ding ding', body: 'picks are locked. tap to cheer for your corner.', haptics: HAPTICS.bell }),
      };
    },
    pause() {
      if (state.status !== 'open') return fail('nothing to pause');
      state.status = 'locked';
      return { ok: true };
    },
    resume() {
      if (state.status !== 'locked') return fail('nothing to resume');
      state.status = 'open';
      return { ok: true };
    },
    surge({ seconds }) {
      if (state.status !== 'open') return fail('ring the bell first');
      const length = clamp(Number(seconds) || DEFAULT_SURGE_S, 5, 120);
      state.surgeUntil = iso(now() + length * 1000);
      return {
        ok: true,
        moment: raise({ headline: 'surge!', body: 'every cheer counts double', color: SURGE_YELLOW, haptics: HAPTICS.surge }),
      };
    },
    surgeOff() {
      if (!state.surgeUntil) return fail('no surge on');
      state.surgeUntil = null;
      return { ok: true };
    },
    /** A fighter is eliminated while the rest fight on (three or four corners). */
    out({ sideId }) {
      const match = stageMatch();
      if (!match || (state.status !== 'open' && state.status !== 'locked')) return fail('only during a match');
      if (match.sides.length < 3) return fail('a one on one ends with the winner');
      const index = sideIndex(match, sideId);
      if (index < 0) return fail('no such corner');
      const out = outOf(match.id);
      if (out.has(sideId)) return fail('already out');
      if (match.sides.length - out.size <= 2) return fail('two left: call the winner');
      state.out[match.id] = [...out, sideId];
      ensureCrowd();
      momentum[index] = 0;
      momentum = normalize(momentum);
      for (const fan of fans.values()) {
        if (fan.cheering.get(match.id) === sideId) fan.cheering.delete(match.id);
      }
      const gone = match.sides[index];
      const rest = match.sides.filter((side) => side.id !== sideId && !out.has(side.id)).map(first);
      post({ who: 'the ring', text: `${first(gone)} is out`, sideId, kind: 'result' });
      return {
        ok: true,
        moment: raise({ headline: `${first(gone)} is out`, body: `${rest.join(' and ')} fight on`, sideId, haptics: HAPTICS.out }),
      };
    },
    winner({ sideId, how }) {
      const match = stageMatch();
      if (!match || (state.status !== 'open' && state.status !== 'locked')) return fail('ring the bell first');
      const index = sideIndex(match, sideId);
      if (index < 0) return fail('no such corner');
      if (outOf(match.id).has(sideId)) return fail('that corner is out');
      const text = typeof how === 'string' ? how.trim().slice(0, 40) : '';
      state.results[match.id] = { winnerId: sideId, ...(text ? { how: text } : {}), at: iso(now()) };
      state.status = 'settled';
      state.surgeUntil = null;
      rankingDirty = true;
      const side = match.sides[index];
      const share = oddsShares(match)[index];
      post({ who: 'the room', text: `${first(side)} wins`, value: `${pct(share)} called it`, sideId, kind: 'result' });
      return {
        ok: true,
        moment: raise({
          headline: `${first(side)} wins`,
          body: `${pct(share)} of the room picked it`,
          sideId,
          holdMs: 2600,
          haptics: HAPTICS.win,
        }),
      };
    },
    /** No contest: the match ends with no winner, and its picks don't count. */
    noContest() {
      const match = stageMatch();
      if (!match || !['upcoming', 'open', 'locked'].includes(state.status)) return fail('no match on stage');
      state.results[match.id] = { winnerId: null, at: iso(now()) };
      state.status = 'settled';
      state.surgeUntil = null;
      state.bellAt = null;
      rankingDirty = true;
      post({ who: 'the ring', text: 'no contest', kind: 'result' });
      return { ok: true, moment: raise({ headline: 'no contest', body: 'picks don’t count this time.' }) };
    },
    /** When the next match's picks open, for the lobby's countdown. */
    schedule({ opensInS }) {
      const seconds = Number(opensInS);
      state.opensAt = Number.isFinite(seconds) && seconds > 0 ? iso(now() + seconds * 1000) : null;
      return { ok: true };
    },
    end() {
      if (state.status === 'upcoming' || state.status === 'open' || state.status === 'locked') {
        return fail('call the match on stage first');
      }
      state.ended = true;
      state.opensAt = null;
      return { ok: true };
    },
    notice({ title, body, tone }) {
      const text = typeof body === 'string' ? body.trim().slice(0, 240) : '';
      state.notice = text
        ? {
          ...(typeof title === 'string' && title.trim() ? { title: title.trim().slice(0, 60) } : {}),
          body: text,
          tone: ['info', 'hype', 'warning'].includes(tone) ? tone : 'info',
        }
        : null;
      return { ok: true };
    },
    hold({ title, body, kicker }) {
      const text = typeof title === 'string' ? title.trim().slice(0, 80) : '';
      state.hold = text
        ? {
          title: text,
          ...(typeof body === 'string' && body.trim() ? { body: body.trim().slice(0, 240) } : {}),
          ...(typeof kicker === 'string' && kicker.trim() ? { kicker: kicker.trim().slice(0, 60) } : {}),
        }
        : null;
      return { ok: true };
    },
    feature({ name, on }) {
      if (!FEATURES.includes(name)) return fail('no such feature');
      const features = { ...state.features };
      if (on) delete features[name];
      else features[name] = false;
      state.features = features;
      return { ok: true };
    },
  };

  /**
   * A spotter command: `{commandId, type, …}`. The same id twice is applied
   * once. `undo` takes back the last change made in the last minute.
   */
  function command(input) {
    const commandId = typeof input?.commandId === 'string' ? input.commandId.slice(0, 80) : '';
    if (!commandId) return fail('missing command id');
    if (state.commandIds.includes(commandId)) return { ok: true, duplicate: true };
    const remember = () => {
      state.commandIds.push(commandId);
      if (state.commandIds.length > REMEMBERED_COMMANDS) state.commandIds.shift();
    };

    if (input.type === 'undo') {
      const last = state.history[state.history.length - 1];
      if (!last || now() - last.at > UNDO_WINDOW_MS) return fail('nothing to undo');
      state.history.pop();
      // Moment ids only move forward: phones skip ids they've already played.
      const { history, commandIds, momentCount } = state;
      Object.assign(state, emptyLiveState(), last.before, { history, commandIds, momentCount });
      rankingDirty = true;
      ensureCrowd();
      remember();
      return { ok: true, undone: last.type };
    }

    const run = COMMANDS[input.type];
    if (!run) return fail('no such command');
    const before = snapshotState();
    const result = run(input);
    if (!result.ok) return result;
    state.history.push({ type: input.type, at: now(), before });
    if (state.history.length > UNDO_DEPTH) state.history.shift();
    remember();
    return result;
  }

  // --- The clock -----------------------------------------------------------

  /**
   * Advances the crowd to now. Returns whether the rope is live (phones need
   * snapshots several times a second) and the moments raised.
   */
  function tick() {
    const at = now();
    const elapsedS = Math.min(2, Math.max(0, (at - lastTickAt) / 1000));
    lastTickAt = at;
    if (state.surgeUntil && at >= Date.parse(state.surgeUntil)) state.surgeUntil = null;
    const match = ensureCrowd();
    const live = Boolean(match) && state.status === 'open';
    if (live) stepCrowd(match, at, elapsedS);
    return { live };
  }

  /** Feed items since the last call, capped: one shared batch for every phone. */
  function drainFeed() {
    const items = pendingFeed;
    pendingFeed = [];
    if (items.length <= FEED_BATCH_MAX) return items;
    const results = items.filter((item) => item.kind === 'result');
    const rest = items.filter((item) => item.kind !== 'result');
    return [...results, ...rest.slice(-(FEED_BATCH_MAX - results.length))].slice(-FEED_BATCH_MAX);
  }

  // --- For the hub and the spotter -------------------------------------------

  function spotterView() {
    const match = stageMatch();
    const { rows } = rank();
    const lastUndo = state.history[state.history.length - 1];
    const counts = match ? pickCounts(match) : [];
    const odds = match ? oddsShares(match) : [];
    return {
      eventId: card.eventId,
      title: card.title,
      ended: state.ended,
      stage: match
        ? {
          matchId: match.id,
          title: match.title,
          status: state.status,
          bellAt: state.bellAt,
          surgeUntil: surging() ? state.surgeUntil : null,
          rope: match.sides.length === 2 ? rope : null,
          sides: match.sides.map((side, index) => ({
            id: side.id,
            name: side.name,
            color: side.color,
            picks: counts[index],
            share: odds[index],
            out: outOf(match.id).has(side.id),
            momentum: match.sides.length > 2 ? momentum[index] ?? 0 : undefined,
            cheering: [...fans.values()].filter((fan) => fan.cheering.get(match.id) === side.id).length,
            topFan: topFanOf(side)?.name ?? null,
          })),
        }
        : null,
      matches: matches().map((each) => {
        const result = state.results[each.id];
        const winner = result?.winnerId ? each.sides.find((side) => side.id === result.winnerId) : null;
        return {
          id: each.id,
          title: each.title,
          sides: each.sides.map((side) => ({ id: side.id, name: side.name })),
          state: result ? 'called' : each.id === state.stageMatchId ? 'on stage' : 'to come',
          result: result ? (winner ? `${winner.name} ${result.how || 'wins'}` : 'no contest') : null,
        };
      }),
      nextMatchId: nextMatch()?.id ?? null,
      opensAt: state.opensAt,
      fans: { total: fans.size, named: [...fans.values()].filter((fan) => fan.name).length },
      leaders: rows.slice(0, 5).map((row) => ({ name: row.fan.name || 'a fan', score: row.score })),
      notice: state.notice,
      hold: state.hold,
      features: state.features,
      undo: lastUndo && now() - lastUndo.at <= UNDO_WINDOW_MS ? { type: lastUndo.type, at: iso(lastUndo.at) } : null,
    };
  }

  function exportFan(deviceId) {
    const fan = fans.get(deviceId);
    if (!fan) return null;
    return {
      deviceId: fan.deviceId,
      name: fan.name ?? null,
      surface: fan.surface,
      source: fan.source ?? null,
      calls: { ...fan.calls },
      joinedAt: new Date(fan.joinedAt),
    };
  }

  /** A new card from the organizer: same event, same fans and calls. */
  function setDefinition(next) {
    card = next;
    rankingDirty = true;
    ensureCrowd();
  }

  ensureCrowd();

  return {
    join,
    handle,
    command,
    tick,
    drainFeed,
    /** The parts every phone shares; build once per broadcast. */
    shared,
    /** This phone's own parts: `{you, board, prompt, cta}`. */
    personal,
    snapshot(deviceId, options) {
      return { ...shared(options), ...personal(deviceId) };
    },
    hasFan: (deviceId) => fans.has(deviceId),
    fanCount: () => fans.size,
    exportState: () => clone(state),
    exportFan,
    spotterView,
    setDefinition,
    get definition() {
      return card;
    },
    /** Snapshots several times a second only while the rope is live. */
    isLive: () => Boolean(stageMatch()) && state.status === 'open',
  };
}

module.exports = {
  createLiveEngine,
  checkLiveName,
  emptyLiveState,
  livePoints,
  LIVE_UNDO_WINDOW_MS: UNDO_WINDOW_MS,
};
