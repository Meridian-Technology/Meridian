/**
 * Renders the Just Go weekly report (see pivotWeeklyReportService.buildWeeklyReport)
 * as email HTML and plain text. Pure: report in, strings out, so it can be
 * previewed from a fixture (`npm run preview:weekly-report`) without a database.
 *
 * Design: Just Go's conventional register, the one used for dense product UI.
 * Brand tokens come from Meridian-Mobile/src/pivot/theme/pivotTheme.ts. Instrument
 * Sans is used for lowercase headings and Space Mono for numbers and metadata,
 * on cream paper with ink rules. The wordmark sits on an ink masthead because
 * its "just" is white. Layout is tables with inline styles so Gmail and Outlook
 * render it; web fonts load in Apple Mail and fall back elsewhere.
 *
 * Small numbers are shown as counts ("9 of 22") with the rate second, because
 * at pilot scale a bare percentage overstates what a handful of people did.
 */

const COLORS = {
  paper: '#F5EFE6',
  raised: '#FAF6EF',
  ink: '#1A1714',
  inkSecondary: 'rgba(26,23,20,0.72)',
  inkTertiary: 'rgba(26,23,20,0.58)',
  rule: 'rgba(26,23,20,0.14)',
  ruleStrong: '#1A1714',
  accent: '#FF4F1F',
  resurrected: '#9A4B00',
  churned: '#1689D9',
  retained: 'rgba(26,23,20,0.2)',
  onInk: '#FAF6EF',
  onInkMuted: 'rgba(250,246,239,0.64)',
};

const DISPLAY = "'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'Space Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@500;600;700&family=Space+Mono:wght@400;700&display=swap';
// Always the production asset: the email is read outside any dev server.
const WORDMARK_URL = 'https://www.meridian.study/justgo/wordmark-1298.png';
const WIDTH = 600;
const PAD = 32;
/** Phones: the card fills the client's message area and the gutter shrinks. */
const PAD_NARROW = 20;
/** Below this many people, lead with the count and treat the rate as a footnote. */
const SMALL_SAMPLE = 20;
const SPARK_HEIGHT = 44;
/** Fixed slots so a new city's few weeks stay narrow bars, right-aligned. */
const SPARK_SLOTS = 8;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function num(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('en-US');
}

function pct(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return '—';
  const value = Number(rate) * 100;
  return value > 0 && value < 10 ? `${value.toFixed(1)}%` : `${Math.round(value)}%`;
}

function plural(count, one, many = `${one}s`) {
  return Number(count) === 1 ? one : many;
}

function shortDate(day) {
  if (!day) return '';
  return new Date(`${day}T00:00:00Z`)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .toLowerCase();
}

/** "+6", "−2", "no change", or '' when either side is unknown. */
function countDelta(value, previous) {
  if (value == null || previous == null) return '';
  const diff = Number(value) - Number(previous);
  if (Number.isNaN(diff)) return '';
  if (!diff) return 'no change';
  return `${diff > 0 ? '+' : '−'}${num(Math.abs(diff))}`;
}

/** "+4 pts", "−3 pts", "no change". */
function rateDelta(value, previous) {
  if (value == null || previous == null) return '';
  const diff = Math.round((Number(value) - Number(previous)) * 100);
  if (Number.isNaN(diff)) return '';
  if (!diff) return 'no change';
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} pts`;
}

/** "9 of 22" with the rate, or just the count when the sample is tiny. */
function fraction(part) {
  if (!part || !part.users) return { main: '—', note: 'no one yet' };
  const rate = part.active / part.users;
  return {
    main: `${num(part.active)} of ${num(part.users)}`,
    note: part.users < SMALL_SAMPLE ? `${pct(rate)} · small sample` : pct(rate),
    rate,
  };
}

/** "up 6 from last week", "same as last week", "first full week". */
function activeChange(report) {
  const previous = report.weeklyActivePrevious;
  if (previous == null) return 'first full week';
  const diff = report.weeklyActive - previous;
  return diff ? `${diff > 0 ? 'up' : 'down'} ${num(Math.abs(diff))} from last week` : 'same as last week';
}

/** The inbox preview: actives, where they came from, and how the drop landed. */
function buildPreheader(report) {
  const active = report.weeklyActive;
  if (!report.startDate || active == null) return 'No drop week has finished yet.';

  const previous = report.weeklyActivePrevious;
  const diff = previous == null ? null : active - previous;
  const change = diff == null ? '' : diff ? `, ${diff > 0 ? 'up' : 'down'} ${num(Math.abs(diff))}` : ', flat';
  const acc = report.accounting;
  const mix = acc && active
    ? ` ${num(acc.new)} new, ${num(acc.resurrected)} back${acc.churned != null ? `, ${num(acc.churned)} lost` : ''}.`
    : '';
  const batch = report.batch;
  const drop = batch?.swipes ? ` ${pct(batch.right / batch.swipes)} of swipes went right.` : '';
  return `${num(active)} weekly ${plural(active, 'active')}${change}.${mix}${drop}`;
}

// ---------------------------------------------------------------------------
// Building blocks

function sectionHead(title, aside = '') {
  return `<tr><td class="jg-pad" style="padding:36px ${PAD}px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-family:${DISPLAY};font-size:20px;line-height:24px;font-weight:700;color:${COLORS.ink};padding-bottom:10px;border-bottom:1px solid ${COLORS.ruleStrong}">${escapeHtml(title)}</td>
        <td align="right" style="font-family:${MONO};font-size:11px;line-height:24px;color:${COLORS.inkTertiary};padding-bottom:10px;border-bottom:1px solid ${COLORS.ruleStrong};white-space:nowrap">${escapeHtml(aside)}</td>
      </tr>
    </table>
  </td></tr>`;
}

function rowCell(content, { align = 'left', width = '', muted = false, mono = true, bold = false } = {}) {
  return `<td${width ? ` width="${width}"` : ''} align="${align}" style="padding:10px 0;border-bottom:1px solid ${COLORS.rule};font-family:${mono ? MONO : DISPLAY};font-size:${mono ? 13 : 15}px;line-height:18px;font-weight:${bold ? 700 : 400};color:${muted ? COLORS.inkTertiary : COLORS.ink};vertical-align:top">${content}</td>`;
}

function small(text) {
  return `<div style="font-family:${MONO};font-size:11px;line-height:15px;font-weight:400;color:${COLORS.inkTertiary};margin-top:2px">${escapeHtml(text)}</div>`;
}

function swatch(color) {
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};margin-right:8px;vertical-align:-1px"></span>`;
}

/** Bottom-aligned bars, one per complete week; the newest is orange. */
function sparkline(points) {
  if (!points.length) return '';
  const max = Math.max(1, ...points.map((point) => point.value || 0));
  const bars = points
    .map((point, index) => {
      const value = point.value || 0;
      const height = value ? Math.max(3, Math.round((value / max) * SPARK_HEIGHT)) : 1;
      const color = index === points.length - 1 ? COLORS.accent : COLORS.retained;
      return `<td valign="bottom" style="padding:0 2px;height:${SPARK_HEIGHT}px">
        <div title="${escapeHtml(`${shortDate(point.startDate)}: ${num(value)}`)}" style="height:${height}px;line-height:${height}px;font-size:1px;background:${color};border-radius:2px 2px 0 0">&nbsp;</div>
      </td>`;
    })
    .join('');
  const blanks = '<td style="padding:0 2px">&nbsp;</td>'.repeat(Math.max(0, SPARK_SLOTS - points.length));
  const slots = Math.max(SPARK_SLOTS, points.length);
  const first = points[0];
  const last = points[points.length - 1];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed">
    <tr>${blanks}${bars}</tr>
    <tr>${blanks ? `<td colspan="${slots - points.length}"></td>` : ''}<td colspan="${points.length}" style="padding-top:6px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="font-family:${MONO};font-size:10px;color:${COLORS.inkTertiary}">${escapeHtml(shortDate(first.startDate))}</td>
        <td align="right" style="font-family:${MONO};font-size:10px;color:${COLORS.inkTertiary}">${escapeHtml(shortDate(last.startDate))}</td>
      </tr></table>
    </td></tr>
  </table>`;
}

/** This week's actives as one 100% bar: new, back after a gap, retained. */
function compositionBar(acc) {
  const total = (acc.new || 0) + (acc.resurrected || 0) + (acc.retained || 0);
  if (!total) return '';
  const segments = [
    { value: acc.new, color: COLORS.accent },
    { value: acc.resurrected, color: COLORS.resurrected },
    { value: acc.retained, color: COLORS.retained },
  ].filter((segment) => segment.value > 0);
  const cells = segments
    .map((segment) => {
      const width = Math.max(1, Math.round((segment.value / total) * 100));
      return `<td width="${width}%" style="height:14px;line-height:14px;font-size:1px;background:${segment.color}">&nbsp;</td>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:4px;overflow:hidden"><tr>${cells}</tr></table>`;
}

/** Cohort average, week 0–4: orange cells whose strength follows the rate. */
function retentionStrip(cells) {
  if (!cells.length) return '';
  const tds = cells
    .map((cell) => {
      const rate = Number(cell.rate) || 0;
      const alpha = Math.round((0.08 + rate * 0.92) * 100) / 100;
      const text = rate >= 0.6 ? COLORS.onInk : COLORS.ink;
      return `<td align="center" style="padding:0 2px">
        <div style="background:rgba(255,79,31,${alpha});border-radius:6px;padding:10px 0;font-family:${MONO};font-size:13px;font-weight:700;color:${text}">${escapeHtml(pct(cell.rate))}</div>
        <div style="font-family:${MONO};font-size:10px;color:${COLORS.inkTertiary};padding-top:6px">wk ${cell.offset} · n=${num(cell.users)}</div>
      </td>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed"><tr>${tds}</tr></table>`;
}

// ---------------------------------------------------------------------------
// Sections

function masthead(report) {
  return `<tr><td class="jg-pad" bgcolor="${COLORS.ink}" style="background:${COLORS.ink};padding:28px ${PAD}px 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle"><img src="${WORDMARK_URL}" width="112" height="67" alt="just go" style="display:block;border:0;width:112px;height:67px"></td>
      <td valign="middle" align="right" style="font-family:${MONO};font-size:11px;line-height:17px;color:${COLORS.onInkMuted}">
        weekly report<br>
        <span style="color:${COLORS.onInk}">${escapeHtml(report.period)}</span>
      </td>
    </tr></table>
  </td></tr>`;
}

function weekSection(report) {
  if (report.weeklyActive == null) {
    return `<tr><td class="jg-pad" style="padding:28px ${PAD}px 0;font-family:${MONO};font-size:13px;line-height:18px;color:${COLORS.inkSecondary}">No drop week has finished yet.</td></tr>`;
  }

  return `<tr><td class="jg-pad" style="padding:28px ${PAD}px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="44%" valign="bottom" style="padding-right:16px">
        <div style="font-family:${DISPLAY};font-size:56px;line-height:56px;font-weight:700;color:${COLORS.ink};letter-spacing:-1px">${escapeHtml(num(report.weeklyActive))}</div>
        <div style="font-family:${MONO};font-size:12px;line-height:16px;color:${COLORS.inkSecondary};padding-top:8px">weekly actives</div>
        <div style="font-family:${MONO};font-size:12px;line-height:16px;color:${COLORS.inkTertiary}">${escapeHtml(activeChange(report))}</div>
      </td>
      <td valign="bottom">${sparkline(report.trend)}</td>
    </tr></table>
  </td></tr>`;
}

function sourcesSection(report) {
  const acc = report.accounting;
  if (!acc || !acc.active) return '';
  const rows = [
    { color: COLORS.accent, label: 'new', hint: 'first week they opened a drop', value: acc.new },
    { color: COLORS.resurrected, label: 'back after a gap', hint: 'skipped last week, active before', value: acc.resurrected },
    { color: COLORS.retained, label: 'retained', hint: 'opened last week too', value: acc.retained },
  ];
  const churnRow = acc.churned != null
    ? `<tr>${rowCell(`${swatch(COLORS.churned)}didn’t come back${small('opened last week, not this one')}`)}${rowCell(num(acc.churned), { align: 'right' })}</tr>`
    : '';
  const quick = acc.quickRatio != null
    ? `<tr><td colspan="2" style="padding-top:12px;font-family:${MONO};font-size:11px;line-height:16px;color:${COLORS.inkTertiary}">quick ratio ${escapeHtml(acc.quickRatio.toFixed(2))}: ${escapeHtml(num((acc.new || 0) + (acc.resurrected || 0)))} gained for ${escapeHtml(num(acc.churned))} lost. above 1 means the active base grew.</td></tr>`
    : '';
  return `${sectionHead('where they came from', `${num(acc.active)} actives`)}
  <tr><td class="jg-pad" style="padding:16px ${PAD}px 0">${compositionBar(acc)}</td></tr>
  <tr><td class="jg-pad" style="padding:8px ${PAD}px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${rows.map((row) => `<tr>${rowCell(`${swatch(row.color)}${escapeHtml(row.label)}${small(row.hint)}`)}${rowCell(num(row.value), { align: 'right' })}</tr>`).join('')}
      ${churnRow}
      ${quick}
    </table>
  </td></tr>`;
}

/** Half-width stat: label, big "x of y", rate and change, then what it counts. */
function stat(label, hint, value, delta) {
  return `<td width="50%" valign="top" style="padding:16px 12px 0 0">
    <div style="font-family:${MONO};font-size:11px;color:${COLORS.inkTertiary}">${escapeHtml(label)}</div>
    <div style="font-family:${DISPLAY};font-size:28px;line-height:34px;font-weight:700;color:${COLORS.ink};padding-top:4px">${escapeHtml(value.main)}</div>
    <div style="font-family:${MONO};font-size:12px;color:${COLORS.inkSecondary};padding-top:2px">${escapeHtml([value.note, delta].filter(Boolean).join(' · '))}</div>
    <div style="font-family:${MONO};font-size:11px;line-height:15px;color:${COLORS.inkTertiary};padding-top:6px">${escapeHtml(hint)}</div>
  </td>`;
}

/** The event's Just Go page when it has one, else the bare name. */
function cardName(card) {
  const name = escapeHtml(card.name);
  if (!card.url) return name;
  return `<a href="${escapeHtml(card.url)}" style="color:${COLORS.ink};text-decoration:underline;text-decoration-color:${COLORS.rule};text-underline-offset:3px">${name}</a>`;
}

/** Named cards with a right-aligned "right swipes of reached" count. */
function cardList(title, cards, showCity) {
  if (!cards.length) return '';
  const rows = cards
    .map((card) => `<tr>
      ${rowCell(`${cardName(card)}${showCity ? small(card.city) : ''}`, { mono: false })}
      ${rowCell(`${num(card.right)} of ${num(card.reached)}${small(pct(card.reached ? card.right / card.reached : null))}`, { align: 'right', width: '30%' })}
    </tr>`)
    .join('');
  return `<tr><td class="jg-pad" style="padding:24px ${PAD}px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td colspan="2" style="padding-bottom:4px;font-family:${MONO};font-size:11px;color:${COLORS.inkTertiary};border-bottom:1px solid ${COLORS.rule}">${escapeHtml(title)}</td></tr>
      ${rows}
    </table>
  </td></tr>`;
}

function batchSection(report) {
  const batch = report.batch;
  if (!batch) return '';
  const aside = `${num(batch.events)} ${plural(batch.events, 'event')}${batch.cityCount > 1 ? ` · ${num(batch.cityCount)} cities` : ''}`;
  if (!batch.events && !batch.swipes) {
    return `${sectionHead('how the drop landed', aside)}
    <tr><td class="jg-pad" style="padding:14px ${PAD}px 0;font-family:${MONO};font-size:12px;color:${COLORS.inkTertiary}">Nothing was published for this week.</td></tr>`;
  }

  const swipes = fraction({ active: batch.right, users: batch.swipes });
  const landed = fraction({ active: batch.landed, users: batch.events });
  const rows = [
    { label: 'dealt to someone', hint: 'events in at least one person’s deck', value: `${num(batch.dealt)} of ${num(batch.events)}` },
    { label: 'passed by everyone', hint: `swiped by ${batch.minReach}+ people, no right swipes`, value: num(batch.passedByAll) },
    { label: 'going', hint: 'said they’re going to a card', value: num(batch.going) },
    batch.rating
      ? { label: 'rating', hint: `from ${num(batch.rating.count)} ${plural(batch.rating.count, 'person', 'people')} who went`, value: `${batch.rating.average.toFixed(1)} / 5` }
      : null,
    { label: 'missing image or description', hint: 'published without one', value: num(batch.missingDetails) },
  ].filter(Boolean);
  const showCity = batch.cityCount > 1;

  return `${sectionHead('how the drop landed', aside)}
  <tr><td class="jg-pad" style="padding:0 ${PAD}px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      ${stat('swiped right', 'interested or going, out of every swipe', swipes, rateDelta(swipes.rate, batch.swipesPrevious ? batch.rightPrevious / batch.swipesPrevious : null))}
      ${stat('cards that landed', 'events with at least one right swipe', landed, '')}
    </tr></table>
  </td></tr>
  <tr><td class="jg-pad" style="padding:8px ${PAD}px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${rows.map((row) => `<tr>${rowCell(`${escapeHtml(row.label)}${small(row.hint)}`)}${rowCell(row.value, { align: 'right' })}</tr>`).join('')}
    </table>
  </td></tr>
  ${cardList('carried the week', batch.top, showCity)}
  ${cardList(`fell flat · ${batch.minReach}+ swipes, lowest share right`, batch.misses, showCity)}
  ${batch.failedCities?.length ? `<tr><td class="jg-pad" style="padding:12px ${PAD}px 0;font-family:${MONO};font-size:11px;line-height:16px;color:${COLORS.inkTertiary}">Not in these numbers: ${escapeHtml(batch.failedCities.join(', '))} (didn’t load).</td></tr>` : ''}`;
}

function stickSection(report) {
  if (!report.activation && !report.week1) return '';
  const activation = fraction(report.activation);
  const week1 = fraction(report.week1);
  return `${sectionHead('do new people stick', `last ${report.cohortCount} cohorts`)}
  <tr><td class="jg-pad" style="padding:0 ${PAD}px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      ${stat('opened in their first week', 'joined, then opened the drop that same week', activation, rateDelta(report.activation?.rate, report.activationPrevious))}
      ${stat('came back the next week', 'opened the drop the week after joining', week1, rateDelta(report.week1?.rate, report.week1Previous))}
    </tr></table>
  </td></tr>
  ${report.retentionAverage.length ? `<tr><td class="jg-pad" style="padding:24px ${PAD}px 0">
    <div style="font-family:${MONO};font-size:11px;color:${COLORS.inkTertiary};padding-bottom:8px">share of each join cohort active n weeks later, finished weeks only</div>
    ${retentionStrip(report.retentionAverage)}
  </td></tr>` : ''}`;
}

function doSection(report) {
  const usage = report.usage;
  if (!usage) return '';
  const rows = [
    {
      label: 'people who saved a plan',
      hint: usage.weeklyActive ? `${pct(usage.planners / usage.weeklyActive)} of actives` : '',
      value: usage.planners,
      delta: countDelta(usage.planners, usage.plannersPrevious),
    },
    {
      label: 'plans saved',
      hint: 'marked interested or going',
      value: usage.plansSaved,
      delta: countDelta(usage.plansSaved, usage.plansSavedPrevious),
    },
    {
      label: 'opened a ticket link',
      hint: 'clicked through to the organizer',
      value: usage.ticketOpeners,
      delta: countDelta(usage.ticketOpeners, usage.ticketOpenersPrevious),
    },
  ];
  return `${sectionHead('what they did with it')}
  <tr><td class="jg-pad" style="padding:8px ${PAD}px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${rows.map((row) => `<tr>${rowCell(`${escapeHtml(row.label)}${row.hint ? small(row.hint) : ''}`)}${rowCell(`${num(row.value)}${row.delta ? small(row.delta) : ''}`, { align: 'right' })}</tr>`).join('')}
    </table>
  </td></tr>`;
}

function citySection(report) {
  const widths = ['38%', '16%', '14%', '14%', '18%'];
  const header = ['city', 'actives', 'new', 'plans', 'back next wk']
    .map((label, index) => `<td width="${widths[index]}"${index ? ' align="right"' : ''} style="padding:10px 0 8px;font-family:${MONO};font-size:10px;color:${COLORS.inkTertiary};border-bottom:1px solid ${COLORS.rule}">${label}</td>`)
    .join('');
  const rows = report.cities.map((city) => {
    const name = `${escapeHtml(city.name)}${city.launchDate ? small(`launched ${shortDate(city.launchDate)}`) : ''}`;
    if (city.error) {
      return `<tr>${rowCell(name)}<td colspan="4" align="right" style="padding:10px 0;border-bottom:1px solid ${COLORS.rule};font-family:${MONO};font-size:12px;color:${COLORS.churned}">didn’t load</td></tr>`;
    }
    if (city.notStarted) {
      return `<tr>${rowCell(`${escapeHtml(city.name)}${small(city.launchDate ? `launches ${shortDate(city.launchDate)}` : 'not launched')}`)}<td colspan="4" align="right" style="padding:10px 0;border-bottom:1px solid ${COLORS.rule};font-family:${MONO};font-size:12px;color:${COLORS.inkTertiary}">counting starts at launch</td></tr>`;
    }
    const week1 = city.week1 && city.week1.users ? `${num(city.week1.active)}/${num(city.week1.users)}` : '—';
    const delta = countDelta(city.weeklyActive, city.weeklyActivePrevious);
    return `<tr>
      ${rowCell(name)}
      ${rowCell(`${num(city.weeklyActive)}${delta ? small(delta) : ''}`, { align: 'right', bold: true })}
      ${rowCell(num(city.newMembers), { align: 'right' })}
      ${rowCell(num(city.planners), { align: 'right' })}
      ${rowCell(week1, { align: 'right' })}
    </tr>`;
  }).join('');
  return `${sectionHead('by city', `${report.cities.length} ${plural(report.cities.length, 'city', 'cities')}`)}
  <tr><td class="jg-pad" style="padding:0 ${PAD}px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${header}</tr>
      ${rows || `<tr>${rowCell('No launched cities yet.', { muted: true })}</tr>`}
    </table>
  </td></tr>`;
}

function landingSection(report) {
  const totals = report.landing?.totals;
  if (!report.startDate) return '';
  if (!totals) {
    return `${sectionHead('landing page')}
    <tr><td class="jg-pad" style="padding:14px ${PAD}px 0;font-family:${MONO};font-size:12px;color:${COLORS.inkTertiary}">Landing data didn’t load this week.</td></tr>`;
  }
  const steps = [
    { label: 'page views', value: totals.views },
    { label: 'visitors', value: totals.uniqueVisitors },
    { label: 'joined waitlist', value: totals.waitlistSignups },
    { label: 'app store clicks', value: totals.storeClicks },
  ];
  const cells = steps
    .map((step, index) => `<td width="25%" valign="top" style="padding:16px 8px 0 0;${index ? `border-left:1px solid ${COLORS.rule};padding-left:12px;` : ''}">
      <div style="font-family:${DISPLAY};font-size:22px;line-height:26px;font-weight:700;color:${COLORS.ink}">${escapeHtml(num(step.value))}</div>
      <div style="font-family:${MONO};font-size:11px;line-height:15px;color:${COLORS.inkTertiary};padding-top:4px">${escapeHtml(step.label)}</div>
    </td>`)
    .join('');
  return `${sectionHead('landing page', 'launched cities')}
  <tr><td class="jg-pad" style="padding:0 ${PAD}px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed"><tr>${cells}</tr></table>
  </td></tr>`;
}

function footer(report) {
  const notLaunched = report.notLaunchedCities || [];
  const notes = [
    notLaunched.length
      ? `Launched cities only. Not counted yet: ${notLaunched.join(', ')}.`
      : null,
    report.failedCities.length
      ? `Not in these numbers: ${report.failedCities.map((city) => city.cityDisplayName).join(', ')} (didn’t load).`
      : null,
    report.preLaunchMembers
      ? `${num(report.preLaunchMembers)} ${plural(report.preLaunchMembers, 'person', 'people')} who joined before their city launched ${report.preLaunchMembers === 1 ? 'is' : 'are'} left out of cohorts.`
      : null,
    'A week runs from drop day to drop day. “Active” means opened the drop or acted on a card. Cohort rates are weighted by cohort size.',
  ].filter(Boolean);
  return `<tr><td class="jg-pad" style="padding:40px ${PAD}px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td bgcolor="${COLORS.accent}" style="background:${COLORS.accent};border-radius:12px">
        <a href="${escapeHtml(report.dashboardUrl)}" style="display:inline-block;padding:14px 22px;font-family:${DISPLAY};font-size:15px;line-height:19px;font-weight:600;color:${COLORS.ink};text-decoration:none">open the growth dashboard</a>
      </td>
    </tr></table>
  </td></tr>
  <tr><td class="jg-pad" style="padding:28px ${PAD}px ${PAD}px">
    ${notes.map((note) => `<p style="margin:0 0 8px;font-family:${MONO};font-size:11px;line-height:16px;color:${COLORS.inkTertiary}">${escapeHtml(note)}</p>`).join('')}
    <p style="margin:16px 0 0;font-family:${MONO};font-size:11px;line-height:16px;color:${COLORS.inkTertiary}">${escapeHtml(report.totalMembers != null ? `${num(report.totalMembers)} members to date · ` : '')}sent to meridian platform admins</p>
  </td></tr>`;
}

function buildWeeklyReportHtml(report) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(report.subject)}</title>
<link href="${FONTS_URL}" rel="stylesheet">
<style>
@media only screen and (max-width:${WIDTH + 24}px) {
  .jg-frame { padding:0 !important; }
  .jg-card { border:0 !important; border-radius:0 !important; }
  .jg-pad { padding-left:${PAD_NARROW}px !important; padding-right:${PAD_NARROW}px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${COLORS.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(report.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.paper}" style="background:${COLORS.paper}">
<tr><td class="jg-frame" align="center" style="padding:24px 12px">
  <table class="jg-card" role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.raised}" style="width:100%;max-width:${WIDTH}px;background:${COLORS.raised};border:1px solid ${COLORS.ruleStrong};border-radius:16px;overflow:hidden">
    ${masthead(report)}
    ${weekSection(report)}
    ${sourcesSection(report)}
    ${batchSection(report)}
    ${stickSection(report)}
    ${doSection(report)}
    ${citySection(report)}
    ${landingSection(report)}
    ${footer(report)}
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function buildWeeklyReportText(report) {
  const lines = [`just go weekly report · ${report.period}`, '', report.preheader, ''];
  const acc = report.accounting;
  if (acc && acc.active) {
    lines.push(
      `Where they came from: ${num(acc.new)} new, ${num(acc.resurrected)} back after a gap, ${num(acc.retained)} retained${acc.churned != null ? `; ${num(acc.churned)} didn’t come back` : ''}`,
      '',
    );
  }
  const batch = report.batch;
  if (batch && (batch.events || batch.swipes)) {
    const swipes = fraction({ active: batch.right, users: batch.swipes });
    const listed = (cards) => cards.map((card) => `- ${card.name} (${num(card.right)} of ${num(card.reached)})${card.url ? ` ${card.url}` : ''}`);
    lines.push(
      `How the drop landed: ${num(batch.events)} events, ${num(batch.dealt)} dealt to someone, ${num(batch.landed)} got a right swipe, ${num(batch.passedByAll)} passed by everyone`,
      `Swiped right: ${swipes.main} (${swipes.note}); ${num(batch.going)} going${batch.rating ? `; rated ${batch.rating.average.toFixed(1)}/5 by ${num(batch.rating.count)}` : ''}; ${num(batch.missingDetails)} missing an image or description`,
    );
    if (batch.top.length) lines.push('Carried the week:', ...listed(batch.top));
    if (batch.misses.length) lines.push('Fell flat:', ...listed(batch.misses));
    lines.push('');
  }
  const activation = fraction(report.activation);
  const week1 = fraction(report.week1);
  lines.push(
    `Opened in their first week: ${activation.main} (${activation.note})`,
    `Came back the next week: ${week1.main} (${week1.note})`,
  );
  if (report.usage) {
    lines.push(
      `Saved a plan: ${num(report.usage.planners)} people, ${num(report.usage.plansSaved)} plans; ${num(report.usage.ticketOpeners)} opened a ticket link`,
    );
  }
  lines.push('', 'By city:');
  report.cities.forEach((city) => {
    if (city.error) lines.push(`- ${city.name}: didn’t load`);
    else if (city.notStarted) lines.push(`- ${city.name}: counting starts at launch`);
    else {
      lines.push(
        `- ${city.name}: ${num(city.weeklyActive)} actives, ${num(city.newMembers)} new, ${num(city.planners)} planned`,
      );
    }
  });
  const totals = report.landing?.totals;
  if (totals) {
    lines.push(
      '',
      `Landing: ${num(totals.views)} views, ${num(totals.uniqueVisitors)} visitors, ${num(totals.waitlistSignups)} joined the waitlist, ${num(totals.storeClicks)} app store clicks`,
    );
  }
  lines.push('', `Dashboard: ${report.dashboardUrl}`);
  return lines.join('\n');
}

module.exports = {
  buildPreheader,
  buildWeeklyReportHtml,
  buildWeeklyReportText,
};
