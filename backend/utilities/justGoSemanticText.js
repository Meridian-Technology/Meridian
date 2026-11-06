const {
  buildJustGoEventDocument,
  JUST_GO_EVENT_DOCUMENT_VERSION,
} = require('./justGoEventDocument');

// The public event document is the single source of text for Atlas autoEmbed.
// A placeholder ID is sufficient for unsaved events: IDs never enter its text.
function buildJustGoSemanticText(event) {
  return buildJustGoEventDocument({
    ...event,
    _id: event._id || 'pending',
    description: String(event.description || '').slice(0, 4000),
  })?.text || '';
}

function setJustGoSemanticText(event) {
  const pivot = event.customFields?.pivot;
  if (!pivot) return event;
  if (pivot.ingestStatus !== 'published') {
    delete pivot.semanticText;
    delete pivot.semanticTextVersion;
    return event;
  }
  pivot.semanticText = buildJustGoSemanticText(event);
  pivot.semanticTextVersion = JUST_GO_EVENT_DOCUMENT_VERSION;
  return event;
}

const SEMANTIC_TEXT_PROJECTION = Object.freeze({
  _id: 1, name: 1, description: 1, type: 1, richLocation: 1, start_time: 1, end_time: 1, 'customFields.pivot': 1,
});

// For writes that change `ingestStatus` or searchable fields in place (`updateMany`,
// dotted `$set`): recompute from the stored documents so autoEmbed sees them.
async function refreshJustGoSemanticText(Event, eventIds) {
  if (!eventIds?.length) return 0;
  const events = await Event.find({ _id: { $in: eventIds } }, SEMANTIC_TEXT_PROJECTION).lean();
  const ops = events.map((event) => {
    const pivot = event.customFields?.pivot;
    const text = pivot?.ingestStatus === 'published' ? buildJustGoSemanticText(event) : '';
    const update = text
      ? { $set: {
        'customFields.pivot.semanticText': text,
        'customFields.pivot.semanticTextVersion': JUST_GO_EVENT_DOCUMENT_VERSION,
      } }
      : { $unset: { 'customFields.pivot.semanticText': '', 'customFields.pivot.semanticTextVersion': '' } };
    return { updateOne: { filter: { _id: event._id, 'customFields.pivot': { $exists: true } }, update } };
  });
  if (ops.length) await Event.bulkWrite(ops, { ordered: false });
  return ops.length;
}

module.exports = { buildJustGoSemanticText, setJustGoSemanticText, refreshJustGoSemanticText };
