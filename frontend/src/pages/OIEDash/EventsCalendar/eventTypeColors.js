/**
 * Shared event type colors for Month, Week, and Day calendar views.
 * Use these so all views show the same colors per event type.
 */
const EVENT_TYPE_COLORS = {
  campus: { background: '#D3DDFD', border: '#6D8EFA' },
  alumni: { background: '#D6D6D6', border: '#5C5C5C' },
  sports: { background: '#D3E8CF', border: '#6EB25F' },
  arts: { background: '#FBEBBB', border: '#FBBC05' },
  meeting: { background: '#FBD8D6', border: 'rgba(250, 117, 109, 1)' },
};

const DEFAULT_COLORS = EVENT_TYPE_COLORS.meeting;

export function getEventColors(event) {
  if (!event?.type) return DEFAULT_COLORS;
  const type = event.type.toLowerCase();
  return EVENT_TYPE_COLORS[type] || DEFAULT_COLORS;
}

export function getEventBackgroundColor(event) {
  return getEventColors(event).background;
}

export function getEventBorderColor(event) {
  return getEventColors(event).border;
}

export default EVENT_TYPE_COLORS;
