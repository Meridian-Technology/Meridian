/**
 * Display string for a classroom's building (populated { name } or legacy string).
 */
function classroomBuildingName(room) {
  if (!room || room.building == null || room.building === '') return '';
  const b = room.building;
  if (typeof b === 'object' && b !== null && 'name' in b) {
    return String(b.name || '');
  }
  return String(b);
}

module.exports = { classroomBuildingName };
