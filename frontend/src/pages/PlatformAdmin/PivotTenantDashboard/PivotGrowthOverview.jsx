import React, { useEffect, useMemo, useState } from 'react';
import { useFetch, authenticatedRequest } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import { PivotOpsBanner, PivotOpsBarList, PivotOpsSection } from '../../../components/PivotOps';
import {
  describeDelta,
  formatCalendarDate,
  formatPercent,
  formatRatio,
  formatWeekRange,
  formatWeekStart,
  retentionCellColors,
} from './pivotGrowthOverviewFormat';
import './PivotGrowthOverview.scss';

const NO_FETCH_CACHE = { enabled: false };

export const RETENTION_DEFINITIONS = Object.freeze([
  { id: 'opened', label: 'Opened the drop' },
  { id: 'swiped', label: 'Swiped' },
  { id: 'planned', label: 'Saved a plan' },
]);

// Just Go brand tokens (pivotTheme.ts): warm hues are gains, cool is loss,
// retained is ink-tinted context. New/resurrected/churned pass the dataviz
// palette checker all-pairs on white; the chart still ships a legend and table.
const ACCOUNTING_SERIES = Object.freeze([
  { key: 'retained', label: 'Retained', color: 'rgba(26, 23, 20, 0.2)' },
  { key: 'resurrected', label: 'Resurrected', color: '#9A4B00' },
  { key: 'new', label: 'New', color: '#FF4F1F' },
  { key: 'churned', label: 'Churned', color: '#1689D9' },
]);
const ACCOUNTING_HEIGHT = 180;
const CURVE_RECENT_COHORTS = 4;
// Week columns have a fixed width so the curve row can place each point at the
// centre of its column. Keep in sync with $cohort-col and border-spacing in SCSS.
const COHORT_COL_WIDTH = 60;
const COHORT_COL_GAP = 3;
const CURVE_HEIGHT = 140; // plot area; the x-axis labels sit below it
const CURVE_AXIS_HEIGHT = 20;
const CURVE_PAD = 8;
const CURVE_TICKS = [0, 0.25, 0.5, 0.75, 1];

function curveY(rate) {
  return CURVE_PAD + (1 - rate) * (CURVE_HEIGHT - 2 * CURVE_PAD);
}

function curveX(offset) {
  return offset * (COHORT_COL_WIDTH + COHORT_COL_GAP) + COHORT_COL_WIDTH / 2;
}

function curvePath(cells) {
  return cells
    .filter((cell) => cell.rate != null)
    .map((cell, index) => `${index ? 'L' : 'M'}${curveX(cell.offset)},${curveY(cell.rate)}`)
    .join(' ');
}

function recentCurveCohorts(table) {
  return (table?.cohorts || [])
    .filter((cohort) => cohort.size)
    .slice(-CURVE_RECENT_COHORTS)
    .map((cohort) => ({
      week: cohort.week,
      startDate: cohort.startDate,
      cells: cohort.cells.filter((cell) => cell.complete),
    }))
    .filter((cohort) => cohort.cells.length > 1);
}

/**
 * Retention curve as the cohort table's footer row: the weighted average (orange)
 * with the most recent cohorts as gray context, each point under its week column.
 * Hovering a column (or focusing a point) shows a guide line and a tooltip with
 * the average and each recent cohort for that week.
 */
function RetentionCurveRow({ table, cohortWeeks, recent }) {
  const [activeOffset, setActiveOffset] = useState(null);
  const average = table?.average || [];
  const width = cohortWeeks * COHORT_COL_WIDTH + (cohortWeeks - 1) * COHORT_COL_GAP;
  const plotBottom = CURVE_HEIGHT;
  const active = activeOffset == null ? null : average.find((cell) => cell.offset === activeOffset);
  const activeRecent = active
    ? recent
        .map((cohort) => ({
          ...cohort,
          cell: cohort.cells.find((cell) => cell.offset === activeOffset && cell.rate != null),
        }))
        .filter((cohort) => cohort.cell)
    : [];

  return (
    <tfoot>
      <tr className="pivot-growth-overview__curve-row">
        <th scope="row" colSpan={2}>
          <span className="pivot-growth-overview__sr-only">Retention curve</span>
          <svg width="100%" height={CURVE_HEIGHT + CURVE_AXIS_HEIGHT} aria-hidden="true">
            {CURVE_TICKS.map((tick) => (
              <text key={tick} className="pivot-growth-overview__axis" x="100%" dx="-8" y={curveY(tick) + 3} textAnchor="end">
                {Math.round(tick * 100)}%
              </text>
            ))}
            <text
              className="pivot-growth-overview__axis"
              x="100%"
              dx="-8"
              y={plotBottom + 14}
              textAnchor="end"
            >
              Weeks since joining
            </text>
          </svg>
        </th>
        <td colSpan={cohortWeeks} className="pivot-growth-overview__curve-cell">
          <svg
            width={width}
            height={CURVE_HEIGHT + CURVE_AXIS_HEIGHT}
            role="img"
            aria-label="Weighted average retention by week since joining"
            onMouseLeave={() => setActiveOffset(null)}
          >
            {CURVE_TICKS.map((tick) => (
              <line key={tick} className="pivot-growth-overview__grid" x1={0} x2={width} y1={curveY(tick)} y2={curveY(tick)} />
            ))}
            {Array.from({ length: cohortWeeks }, (_, offset) => (
              <text
                key={offset}
                className={`pivot-growth-overview__axis${
                  offset === activeOffset ? ' is-active' : ''
                }`}
                x={curveX(offset)}
                y={plotBottom + 14}
                textAnchor="middle"
              >
                W{offset}
              </text>
            ))}
            {active ? (
              <line
                className="pivot-growth-overview__guide"
                x1={curveX(active.offset)}
                x2={curveX(active.offset)}
                y1={CURVE_PAD}
                y2={plotBottom - CURVE_PAD}
              />
            ) : null}
            {recent.map((cohort) => (
              <path key={cohort.week} className="pivot-growth-overview__curve-context" d={curvePath(cohort.cells)} />
            ))}
            <path className="pivot-growth-overview__curve-line" d={curvePath(average)} />
            {activeRecent.map((cohort) => (
              <circle
                key={cohort.week}
                className="pivot-growth-overview__context-point"
                cx={curveX(cohort.cell.offset)}
                cy={curveY(cohort.cell.rate)}
                r="4"
              />
            ))}
            {average.map((cell) => (
              <circle
                key={cell.offset}
                className={`pivot-growth-overview__curve-point${
                  cell.offset === activeOffset ? ' is-active' : ''
                }`}
                cx={curveX(cell.offset)}
                cy={curveY(cell.rate)}
                r={cell.offset === activeOffset ? 5 : 4}
              />
            ))}
            {/* Column-wide hit targets, one per week that has an average. */}
            {average.map((cell) => (
              <rect
                key={cell.offset}
                className="pivot-growth-overview__hit"
                x={curveX(cell.offset) - (COHORT_COL_WIDTH + COHORT_COL_GAP) / 2}
                y={0}
                width={COHORT_COL_WIDTH + COHORT_COL_GAP}
                height={CURVE_HEIGHT + CURVE_AXIS_HEIGHT}
                tabIndex={0}
                aria-label={`Week ${cell.offset}: ${formatPercent(cell.rate)} of ${cell.users} people across ${
                  cell.cohorts
                } cohort${cell.cohorts === 1 ? '' : 's'}`}
                onMouseEnter={() => setActiveOffset(cell.offset)}
                onFocus={() => setActiveOffset(cell.offset)}
                onBlur={() => setActiveOffset(null)}
              />
            ))}
          </svg>
          {active ? (
            <div
              className={`pivot-growth-overview__curve-tip${
                active.offset > cohortWeeks / 2 ? ' is-left' : ''
              }`}
              style={{ left: curveX(active.offset), top: curveY(active.rate) }}
              role="tooltip"
            >
              <strong>Week {active.offset}</strong>
              <span className="pivot-growth-overview__curve-tip-row">
                <span className="pivot-growth-overview__key pivot-growth-overview__key--line" />
                All cohorts {formatPercent(active.rate)}
                <em>
                  {' '}
                  · {active.users} people, {active.cohorts} cohort{active.cohorts === 1 ? '' : 's'}
                </em>
              </span>
              {activeRecent.map((cohort) => (
                <span key={cohort.week} className="pivot-growth-overview__curve-tip-row">
                  <span className="pivot-growth-overview__key pivot-growth-overview__key--context" />
                  Joined {formatWeekStart(cohort.startDate)} {formatPercent(cohort.cell.rate)}
                </span>
              ))}
            </div>
          ) : null}
        </td>
      </tr>
    </tfoot>
  );
}

export const METRIC_DEFINITIONS = Object.freeze([
  {
    term: 'Drop week',
    body: 'The unit of time: the city’s drop day through the day before the next drop (UTC). Just Go is used once a week, so everything is weekly rather than daily.',
  },
  {
    term: 'Weekly actives',
    body: 'People who opened that week’s drop or acted on a card in it. This is the north-star count.',
  },
  {
    term: 'New members',
    body: 'People who joined the city in that drop week. Referral share is the part who redeemed a referral code.',
  },
  {
    term: 'Activation',
    body: 'Of people who joined in a drop week, the share active in that same week. Weighted over the four most recent complete cohorts.',
  },
  {
    term: 'Week-1 retention',
    body: 'Of people who joined in a drop week, the share active in the next drop week. Weighted over the four most recent cohorts whose week 1 is complete.',
  },
  {
    term: 'Cohort retention',
    body: 'Each row is the people who joined in one drop week; each cell is the share active N weeks later, under the chosen activity definition. Dashed cells are the week in progress. The top row is the average weighted by cohort size, using finished weeks only. A curve that flattens means a lasting core of users.',
  },
  {
    term: 'Growth accounting',
    body: 'Weekly actives split into new (first active week ever), retained (also active last week), resurrected (back after a gap), and churned (active last week, not this week).',
  },
  {
    term: 'Quick ratio',
    body: '(New + resurrected) ÷ churned. Above 1 the active base is growing; mature consumer products sit around 1, fast-growing ones well above it.',
  },
  {
    term: 'Plan rate',
    body: 'Weekly actives who saved at least one plan (interested or going).',
  },
  {
    term: 'Weeks active',
    body: 'Of people active at least once in the last four complete drop weeks, how many weeks each was active. A weekly power-user curve: weight on the right means a habit.',
  },
  {
    term: 'Ticket click-throughs',
    body: 'People who opened an organizer’s ticket or RSVP link from a card that week: value delivered to the supply side.',
  },
]);

function Delta({ delta }) {
  if (!delta) return null;
  const glyph = delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '■';
  return (
    <span className="pivot-growth-overview__delta" aria-label={`${delta.label} vs prior week`}>
      <span aria-hidden="true">{glyph}</span> {delta.text}
    </span>
  );
}

function Sparkline({ values, label }) {
  const points = values.filter((value) => Number.isFinite(value));
  if (points.length < 2) return null;
  const width = 88;
  const height = 24;
  const max = Math.max(1, ...points);
  const step = width / (points.length - 1);
  const coords = points.map((value, index) => [
    Math.round(index * step * 10) / 10,
    Math.round((height - 3 - (value / max) * (height - 6)) * 10) / 10,
  ]);
  const [lastX, lastY] = coords[coords.length - 1];
  return (
    <svg
      className="pivot-growth-overview__sparkline"
      viewBox={`-4 0 ${width + 8} ${height}`}
      role="img"
      aria-label={label}
    >
      <polyline points={coords.map((pair) => pair.join(',')).join(' ')} />
      <circle cx={lastX} cy={lastY} r="3" />
    </svg>
  );
}

function StatTile({ label, value, hint, delta, spark }) {
  return (
    <div className="pivot-growth-overview__tile" role="group" aria-label={label}>
      <span className="pivot-growth-overview__tile-label">{label}</span>
      <div className="pivot-growth-overview__tile-row">
        <span className="pivot-growth-overview__tile-value">{value}</span>
        {spark}
      </div>
      <Delta delta={delta} />
      {hint ? <span className="pivot-growth-overview__tile-hint">{hint}</span> : null}
    </div>
  );
}

function RetentionCell({ cell, cohortLabel }) {
  if (!cell) return <td className="pivot-growth-overview__cell pivot-growth-overview__cell--empty" />;
  const colors = cell.complete ? retentionCellColors(cell.rate) : null;
  const status = cell.complete ? '' : ' (week in progress)';
  const tip = `${cohortLabel} · week ${cell.offset}: ${formatPercent(cell.rate)} (${cell.active} people)${status}`;
  return (
    <td
      className={`pivot-growth-overview__cell${
        cell.complete ? '' : ' pivot-growth-overview__cell--partial'
      }`}
      style={colors || undefined}
      data-tip={tip}
      aria-label={tip}
      tabIndex={0}
    >
      {formatPercent(cell.rate)}
    </td>
  );
}

function CohortTable({ table, cohortWeeks }) {
  const cohorts = [...(table?.cohorts || [])].reverse();
  const average = table?.average || [];
  const columns = Array.from({ length: cohortWeeks }, (_, offset) => offset);
  const showCurve = average.length >= 2;
  const recent = showCurve ? recentCurveCohorts(table) : [];
  return (
    <div className="pivot-growth-overview__table-wrap">
      <table className="pivot-growth-overview__cohorts" aria-label="Cohort retention by join week">
        <thead>
          <tr>
            <th scope="col">Joined</th>
            <th scope="col" className="pivot-growth-overview__num">Members</th>
            {columns.map((offset) => (
              <th scope="col" key={offset} className="pivot-growth-overview__week-col">
                Week {offset}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="pivot-growth-overview__average-row">
            <th scope="row">All cohorts</th>
            <td className="pivot-growth-overview__num">
              {average[0]?.users ?? '—'}
            </td>
            {columns.map((offset) => {
              const cell = average[offset];
              if (!cell) return <td key={offset} className="pivot-growth-overview__cell--empty" />;
              const tip = `Week ${offset}: ${formatPercent(cell.rate)} across ${cell.cohorts} cohort${
                cell.cohorts === 1 ? '' : 's'
              } (${cell.users} people)`;
              return (
                <td
                  key={offset}
                  className="pivot-growth-overview__cell"
                  style={retentionCellColors(cell.rate)}
                  data-tip={tip}
                  aria-label={tip}
                  tabIndex={0}
                >
                  {formatPercent(cell.rate)}
                </td>
              );
            })}
          </tr>
          {cohorts.map((cohort) => {
            const cohortLabel = `Joined ${formatWeekRange(cohort.startDate)}`;
            return (
              <tr key={cohort.week} className={cohort.size ? undefined : 'is-empty'}>
                <th scope="row" title={cohort.week}>{formatWeekRange(cohort.startDate)}</th>
                <td className="pivot-growth-overview__num">{cohort.size}</td>
                {columns.map((offset) =>
                  cohort.size ? (
                    <RetentionCell key={offset} cell={cohort.cells[offset]} cohortLabel={cohortLabel} />
                  ) : (
                    <td key={offset} className="pivot-growth-overview__cell--empty" />
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
        {showCurve ? (
          <RetentionCurveRow table={table} cohortWeeks={cohortWeeks} recent={recent} />
        ) : null}
      </table>
      {showCurve ? (
        <p className="pivot-growth-overview__curve-legend">
          <span className="pivot-growth-overview__key pivot-growth-overview__key--line" /> All cohorts, weighted
          <span className="pivot-growth-overview__key pivot-growth-overview__key--context" />
          {' '}
          {recent.length} most recent cohorts
        </p>
      ) : null}
    </div>
  );
}

function GrowthAccountingChart({ rows }) {
  const maxUp = Math.max(1, ...rows.map((row) => row.retained + row.resurrected + row.new));
  const maxDown = Math.max(0, ...rows.map((row) => row.churned || 0));
  const scale = ACCOUNTING_HEIGHT / (maxUp + maxDown || 1);
  const upHeight = maxUp * scale;
  const downHeight = maxDown * scale;
  const upSeries = ACCOUNTING_SERIES.filter((series) => series.key !== 'churned');
  const churn = ACCOUNTING_SERIES.find((series) => series.key === 'churned');

  return (
    <div className="pivot-growth-overview__accounting">
      <ul className="pivot-growth-overview__legend" aria-label="Legend">
        {[...upSeries].reverse().concat(churn).map((series) => (
          <li key={series.key}>
            <span className="pivot-growth-overview__swatch" style={{ background: series.color }} />
            {series.label}
          </li>
        ))}
      </ul>
      <div className="pivot-growth-overview__columns" role="img" aria-label="Weekly growth accounting">
        {rows.map((row) => {
          const visibleUp = upSeries.filter((series) => row[series.key] > 0);
          const tip = [
            `${formatWeekRange(row.startDate)}${row.complete ? '' : ' (in progress)'}`,
            `Active ${row.active}`,
            `New ${row.new} · Resurrected ${row.resurrected} · Retained ${row.retained}`,
            row.complete
              ? `Churned ${row.churned} · Quick ratio ${formatRatio(row.quickRatio)}`
              : 'Churn and quick ratio are known once the week ends',
          ].join('\n');
          return (
            <div
              key={row.week}
              className={`pivot-growth-overview__column${row.complete ? '' : ' is-partial'}`}
              tabIndex={0}
              aria-label={tip}
            >
              <div className="pivot-growth-overview__column-up" style={{ height: upHeight }}>
                {visibleUp.map((series, index) => (
                  <span
                    key={series.key}
                    className={`pivot-growth-overview__segment${
                      index === visibleUp.length - 1 ? ' is-end' : ''
                    }`}
                    style={{ height: row[series.key] * scale, backgroundColor: series.color }}
                  />
                ))}
              </div>
              <div className="pivot-growth-overview__baseline" />
              <div className="pivot-growth-overview__column-down" style={{ height: downHeight }}>
                {row.churned ? (
                  <span
                    className="pivot-growth-overview__segment is-end"
                    style={{ height: row.churned * scale, backgroundColor: churn.color }}
                  />
                ) : null}
              </div>
              <span className="pivot-growth-overview__column-label">
                {row.complete ? formatWeekStart(row.startDate) : 'So far'}
              </span>
              <span className="pivot-growth-overview__column-ratio" title="Quick ratio">
                {formatRatio(row.quickRatio)}
              </span>
              <span className="pivot-growth-overview__tip" role="tooltip">{tip}</span>
            </div>
          );
        })}
      </div>
      <p className="pivot-growth-overview__footnote">
        Bottom row: quick ratio, (new + resurrected) ÷ churned. The hatched column is the week in
        progress; its churn is only known once the week ends.
      </p>
      <details className="pivot-growth-overview__table-toggle">
        <summary>Show as table</summary>
        <table className="pivot-growth-overview__plain-table" aria-label="Growth accounting by week">
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Active</th>
              <th scope="col">New</th>
              <th scope="col">Resurrected</th>
              <th scope="col">Retained</th>
              <th scope="col">Churned</th>
              <th scope="col">Quick ratio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.week}>
                <th scope="row">
                  {formatWeekRange(row.startDate)}
                  {row.complete ? '' : ' (in progress)'}
                </th>
                <td>{row.active}</td>
                <td>{row.new}</td>
                <td>{row.resurrected}</td>
                <td>{row.retained}</td>
                <td>{row.churned ?? '—'}</td>
                <td>{formatRatio(row.quickRatio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/**
 * The city's launch date: counting starts with the drop week that contains it.
 * Saved on the tenant (`pivotLaunchDate`); clearing it counts all history.
 */
function LaunchDateControl({ tenantKey, launchDate, launch, preLaunchMembers, onSaved }) {
  const { addNotification } = useNotification() || {};
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(launchDate || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const save = async (value) => {
    setSaving(true);
    setSaveError(null);
    const { data: res, error: reqError } = await authenticatedRequest(
      `/admin/platform/tenants/${encodeURIComponent(tenantKey)}`,
      {
        method: 'PUT',
        data: { pivotLaunchDate: value || null },
        headers: { 'Content-Type': 'application/json' },
      },
    );
    setSaving(false);
    if (reqError || !res?.success) {
      setSaveError(res?.message || reqError || 'Unable to save the launch date.');
      return;
    }
    setEditing(false);
    addNotification?.({
      title: value ? 'Launch date saved' : 'Launch date cleared',
      message: value
        ? `Growth now counts from ${formatCalendarDate(value)}.`
        : 'Growth now counts all history.',
      type: 'success',
    });
    onSaved?.();
  };

  if (editing) {
    return (
      <form
        className="pivot-growth-overview__launch"
        onSubmit={(event) => {
          event.preventDefault();
          save(draft);
        }}
      >
        <label className="pivot-growth-overview__launch-field">
          <span>Launch date</span>
          <input
            className="linear-input"
            type="date"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={saving}
            required
          />
        </label>
        <button type="submit" className="linear-btn linear-btn--primary linear-btn--sm" disabled={saving || !draft}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {launchDate ? (
          <button
            type="button"
            className="linear-btn linear-btn--ghost linear-btn--sm"
            onClick={() => save(null)}
            disabled={saving}
          >
            Count all history
          </button>
        ) : null}
        <button
          type="button"
          className="linear-btn linear-btn--ghost linear-btn--sm"
          onClick={() => {
            setEditing(false);
            setSaveError(null);
            setDraft(launchDate || '');
          }}
          disabled={saving}
        >
          Cancel
        </button>
        {saveError ? (
          <p className="pivot-lab__error" role="alert">
            {saveError}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <p className="pivot-growth-overview__launch">
      {launchDate ? (
        <>
          Counting from launch · <strong>{formatCalendarDate(launchDate)}</strong>
          {launch?.startDate ? <span> (drop week of {formatWeekStart(launch.startDate)})</span> : null}
          {preLaunchMembers ? (
            <span>
              {' '}
              · {preLaunchMembers} {preLaunchMembers === 1 ? 'person' : 'people'} who joined earlier
              {preLaunchMembers === 1 ? ' is' : ' are'} not in cohorts
            </span>
          ) : null}
        </>
      ) : (
        <>Counting all history · no launch date set</>
      )}
      <button
        type="button"
        className="pivot-growth-overview__link-btn"
        onClick={() => {
          setDraft(launchDate || '');
          setEditing(true);
        }}
      >
        {launchDate ? 'Change' : 'Set launch date'}
      </button>
    </p>
  );
}

/**
 * Growth → Overview: a city (or, without `tenantKey`, all cities) as a startup
 * would report it to investors — weekly actives, activation and cohort
 * retention, growth accounting, engagement depth, and value delivered.
 * Definitions live in METRIC_DEFINITIONS and backend/utilities/pivotGrowthMetrics.js.
 */
function PivotGrowthOverview({ tenantKey, refetchRef }) {
  const [definition, setDefinition] = useState('opened');
  const url = tenantKey
    ? `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/analytics/overview`
    : '/admin/pivot/analytics/overview';
  const { data: response, loading, error, refetch } = useFetch(url, { cache: NO_FETCH_CACHE });

  useEffect(() => {
    if (!refetchRef) return undefined;
    refetchRef.current = refetch;
    return () => {
      if (refetchRef.current === refetch) refetchRef.current = null;
    };
  }, [refetch, refetchRef]);

  const data = response?.success ? response.data : null;
  const message =
    error || (response && !response.success ? response.message || 'Unable to load overview.' : null);

  const series = useMemo(() => data?.series || [], [data?.series]);
  const completeSeries = useMemo(() => series.filter((row) => row.complete), [series]);
  const lastWeek = completeSeries[completeSeries.length - 1];
  const accountingRows = useMemo(
    () =>
      (data?.growthAccounting || []).map((row) => ({
        ...row,
        startDate: series.find((week) => week.week === row.week)?.startDate,
      })),
    [data?.growthAccounting, series],
  );

  if (message && !data) {
    return (
      <p className="pivot-lab__error" role="alert">
        {typeof message === 'string' ? message : 'Unable to load overview.'}
      </p>
    );
  }
  if (loading && !data) {
    return <p className="pivot-lab__empty">Loading overview…</p>;
  }
  if (!data) return null;

  const { headline, engagement } = data;
  const table = data.retention?.[definition];
  const spark = (key, label) => (
    <Sparkline values={completeSeries.map((row) => row[key])} label={`${label}, last ${completeSeries.length} weeks`} />
  );

  const notStarted = Boolean(data.launch && !data.launch.started);
  const cityList = (data.cities || [])
    .map((city) => (city.launchDate
      ? `${city.cityDisplayName} from ${formatWeekStart(city.launchDate)}`
      : city.cityDisplayName))
    .join(', ');

  return (
    <div className="pivot-growth-overview">
      {notStarted ? null : (
        <p className="pivot-growth-overview__period">
          {lastWeek ? (
            <>
              Last complete drop week · <strong>{formatWeekRange(lastWeek.startDate)}</strong>
            </>
          ) : (
            'The first drop week since launch is still in progress'
          )}
          <span> · {data.totalMembers} members to date</span>
          {data.scope === 'fleet' ? (
            <span>
              {' '}
              across {data.cities?.length ?? 0} cit{data.cities?.length === 1 ? 'y' : 'ies'}
              {cityList ? ` (${cityList})` : ''}
              . People in more than one city count once; each city counts from its launch date.
            </span>
          ) : null}
        </p>
      )}

      {tenantKey ? (
        <LaunchDateControl
          key={data.launchDate || 'none'}
          tenantKey={tenantKey}
          launchDate={data.launchDate}
          launch={data.launch}
          preLaunchMembers={data.preLaunchMembers}
          onSaved={refetch}
        />
      ) : null}

      {notStarted ? (
        <PivotOpsBanner tone="info" title="Counting hasn’t started yet">
          Growth metrics start with the drop week of {formatWeekRange(data.launch.startDate)}.
          Nothing before launch is counted.
        </PivotOpsBanner>
      ) : null}

      {data.failedCities?.length ? (
        <PivotOpsBanner tone="warn" title="Some cities are missing from these numbers">
          Could not load {data.failedCities.map((city) => city.cityDisplayName).join(', ')}. Refresh to
          try again.
        </PivotOpsBanner>
      ) : null}

      {notStarted ? null : (
      <>

      <div className="pivot-growth-overview__tiles">
        <StatTile
          label="Weekly actives"
          value={headline.weeklyActive.value}
          delta={describeDelta(headline.weeklyActive.value, headline.weeklyActive.previous)}
          spark={spark('weeklyActive', 'Weekly actives')}
          hint="Opened the drop or acted on a card"
        />
        <StatTile
          label="New members"
          value={headline.newMembers.value}
          delta={describeDelta(headline.newMembers.value, headline.newMembers.previous)}
          spark={spark('newMembers', 'New members')}
          hint={
            headline.newMembers.referredShare != null
              ? `${formatPercent(headline.newMembers.referredShare)} via referral`
              : 'Joined this drop week'
          }
        />
        <StatTile
          label="Activation"
          value={formatPercent(headline.activation.value)}
          delta={describeDelta(headline.activation.value, headline.activation.previous, 'rate')}
          hint={
            headline.activation.value == null
              ? `Needs ${headline.activation.cohorts} complete cohorts`
              : `Active in join week · last ${headline.activation.cohorts} cohorts`
          }
        />
        <StatTile
          label="Week-1 retention"
          value={formatPercent(headline.week1Retention.value)}
          delta={describeDelta(headline.week1Retention.value, headline.week1Retention.previous, 'rate')}
          hint={
            headline.week1Retention.value == null
              ? `Needs ${headline.week1Retention.cohorts} cohorts with a finished week 1`
              : `Back the next drop · last ${headline.week1Retention.cohorts} cohorts`
          }
        />
        <StatTile
          label="Quick ratio"
          value={formatRatio(headline.quickRatio.value)}
          delta={describeDelta(headline.quickRatio.value, headline.quickRatio.previous, 'ratio')}
          hint={headline.quickRatio.value == null ? 'No churn last week' : '(New + resurrected) ÷ churned'}
        />
        <StatTile
          label="Plan rate"
          value={formatPercent(headline.planRate.value)}
          delta={describeDelta(headline.planRate.value, headline.planRate.previous, 'rate')}
          spark={spark('planners', 'People who saved a plan')}
          hint="Weekly actives who saved a plan"
        />
      </div>

      <PivotOpsSection
        title="Cohort retention"
        titleId="pivot-growth-cohorts"
        description="People grouped by the drop week they joined. Week 0 is the join week; each cell is the share active that many drops later."
        actions={
          <div className="pivot-growth-overview__segmented" role="group" aria-label="Counts as active">
            {RETENTION_DEFINITIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={definition === option.id ? 'is-active' : undefined}
                aria-pressed={definition === option.id}
                onClick={() => setDefinition(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
        {data.totalMembers ? (
          <CohortTable table={table} cohortWeeks={data.cohortWeeks} />
        ) : (
          <p className="pivot-lab__empty">
            {data.scope === 'fleet' ? 'No members have joined any city yet.' : 'No members have joined this city yet.'}
          </p>
        )}
      </PivotOpsSection>

      <PivotOpsSection
        title="Growth accounting"
        titleId="pivot-growth-accounting"
        description="Where each week’s actives came from, and who didn’t come back."
      >
        <GrowthAccountingChart rows={accountingRows} />
      </PivotOpsSection>

      <div className="pivot-growth-overview__pair">
        <PivotOpsSection
          title="Weeks active"
          titleId="pivot-growth-engagement"
          description={
            engagement.buckets.length
              ? `Of ${engagement.activeUsers} people active in the last ${engagement.buckets.length} drop weeks.`
              : 'No complete drop week since launch yet.'
          }
        >
          <PivotOpsBarList
            ariaLabel={`People by weeks active in the last ${engagement.buckets.length} drop weeks`}
            items={[...engagement.buckets].reverse().map((bucket) => ({
              key: String(bucket.weeksActive),
              label: `${bucket.weeksActive} of ${engagement.buckets.length} weeks`,
              value: bucket.users,
              hint: formatPercent(engagement.activeUsers ? bucket.users / engagement.activeUsers : null),
            }))}
            valueFormat={(value) => `${value} people`}
          />
        </PivotOpsSection>

        <PivotOpsSection
          title="Value delivered"
          titleId="pivot-growth-value"
          description="Plans saved by users, and click-throughs sent to organizers."
        >
          <div className="pivot-growth-overview__tiles pivot-growth-overview__tiles--compact">
            <StatTile
              label="Plans saved"
              value={lastWeek?.plansSaved ?? 0}
              spark={spark('plansSaved', 'Plans saved')}
              hint="Interested or going, last drop week"
            />
            <StatTile
              label="Ticket click-throughs"
              value={lastWeek?.ticketOpeners ?? 0}
              spark={spark('ticketOpeners', 'People who opened a ticket link')}
              hint="People who opened an organizer link"
            />
          </div>
        </PivotOpsSection>
      </div>

      </>
      )}

      <details className="pivot-growth-overview__definitions">
        <summary>How these are calculated</summary>
        <dl>
          {METRIC_DEFINITIONS.map((item) => (
            <React.Fragment key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.body}</dd>
            </React.Fragment>
          ))}
        </dl>
      </details>
    </div>
  );
}

export default PivotGrowthOverview;
