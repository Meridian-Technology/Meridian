// Geometry is always in slide pixels, independent of editor zoom.
function rotateVector(x, y, degrees = 0) {
  const angle = degrees * Math.PI / 180;
  return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
}
function screenDeltaToLocal(dx, dy, zoom = 1, rotation = 0) {
  const vector = rotateVector(dx / zoom, dy / zoom, -rotation);
  return { dx: vector.x, dy: vector.y };
}
function textStyle(element) {
  const style = element.style || {};
  const title = /title|name/.test(element.role || '');
  return {
    fontFamily: style.fontFamily || (title ? 'Les Flos Sans' : 'Instrument Sans'),
    fontSize: style.fontSizePx ?? ((style.fontSize ?? (title ? 8 : 2.8)) * 10.8),
    lineHeight: style.lineHeight ?? (title ? 0.97 : 1.35),
    letterSpacing: style.letterSpacingPx ?? (title ? -3.4 : 0),
    fontWeight: style.fontWeight || (element.role === 'event-date' ? 700 : 400),
    color: style.color || (title ? '#ff4f1f' : '#1a1714'),
    maxWidth: style.maxWidthPx,
    textAlign: style.textAlign || 'left',
  };
}
module.exports = { rotateVector, screenDeltaToLocal, textStyle };
