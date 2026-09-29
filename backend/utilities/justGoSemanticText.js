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

module.exports = { buildJustGoSemanticText, setJustGoSemanticText };
