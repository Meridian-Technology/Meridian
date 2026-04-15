/**
 * Label for UI when API may return building as a populated subdoc or a plain string.
 */
export function classroomBuildingLabel(room) {
  if (!room || room.building == null || room.building === '') return '';
  const b = room.building;
  if (typeof b === 'object' && b !== null && 'name' in b) {
    return String(b.name || '');
  }
  return String(b);
}
