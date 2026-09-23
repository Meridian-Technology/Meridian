import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { authenticatedRequest, useFetch } from '../../../hooks/useFetch';
import {
  formatPivotCopyTemplate,
  nestedTokenParams,
} from '../PivotTenantDashboard/pivotCopyFormat';
import { COPY_ENTRY_MAX_LENGTH } from '../PivotTenantDashboard/pivotVoiceCatalog';

const NO_FETCH_CACHE = { enabled: false };
const WRITE_PATH = '/admin/pivot/copy';

export const HANDLER_VOICE_KEYS = {
  weekly_drop: {
    title: 'notifications.weeklyDrop.title',
    body: 'notifications.weeklyDrop.body',
  },
  solo_swipe_reminder: {
    title: 'notifications.ritual.swipe.title',
    body: 'notifications.ritual.swipe.body',
  },
  ritual_crew_scan: {
    title: 'notifications.ritual.quorumWaiting.title',
    body: 'notifications.ritual.quorumWaiting.body',
  },
  ritual_crew_consensus: {
    title: 'notifications.ritual.decidePending.title',
    body: 'notifications.ritual.decidePending.body',
  },
  event_discovery: {
    title: 'notifications.definition.title',
    body: 'notifications.definition.body',
  },
};

export function voiceKeysFor(definition, handlerKey) {
  const defaults = HANDLER_VOICE_KEYS[handlerKey] || HANDLER_VOICE_KEYS.event_discovery;
  return {
    title: definition?.copyTitleKey || defaults.title,
    body: definition?.copyBodyKey || defaults.body,
  };
}

function catalogPayload(response) {
  if (!response?.success || !response.data) return { keys: [], tokens: [] };
  return {
    keys: response.data.keys || [],
    tokens: response.data.tokens || [],
  };
}

function layersPayload(response) {
  if (!response?.success || !response.data) return { entries: {}, tokens: {} };
  return {
    entries: response.data.entries || {},
    tokens: response.data.tokens || {},
  };
}

function resolveVoicePath(keys, key, suffix) {
  const path = String(key || '').trim();
  if (!path || !keys.length) return path;
  if (keys.some((row) => row.path === path)) return path;
  const suffixed = path.endsWith(`.${suffix}`) ? path : `${path}.${suffix}`;
  if (keys.some((row) => row.path === suffixed)) return suffixed;
  return path;
}

function storedText(layer, shipped) {
  const platform = layer?.platform ?? null;
  const base = layer?.shipped ?? shipped ?? '';
  const effective = layer?.effective ?? platform ?? base;
  const text = platform ?? effective ?? base ?? '';
  const baseline = platform ?? base ?? '';
  return { text, baseline };
}

function highlightIcu(value) {
  const text = String(value ?? '');
  const nodes = [];
  const pattern = /\{[^{}]+\}/g;
  let last = 0;
  let match = pattern.exec(text);
  let key = 0;
  while (match) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(
      <span key={key} className="pivot-notification-copy__tok">
        {match[0]}
      </span>,
    );
    key += 1;
    last = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : '\u00a0';
}

function CopyField({ label, value, onChange, preview, disabled }) {
  const highlightRef = useRef(null);

  return (
    <div className="pivot-notification-copy">
      <label>
        <span className="pivot-notification-copy__label">{label}</span>
        <div className="pivot-notification-copy__input">
          <pre ref={highlightRef} aria-hidden="true">
            {highlightIcu(value)}
            {'\n'}
          </pre>
          <textarea
            aria-label={label}
            value={value}
            disabled={disabled}
            spellCheck={false}
            rows={2}
            maxLength={COPY_ENTRY_MAX_LENGTH}
            onScroll={(event) => {
              if (!highlightRef.current) return;
              highlightRef.current.scrollTop = event.target.scrollTop;
              highlightRef.current.scrollLeft = event.target.scrollLeft;
            }}
            onChange={onChange}
          />
        </div>
      </label>
      <div className="pivot-notification-copy__output">
        <span>Output</span>
        <p className={preview.ok ? undefined : 'is-error'}>
          {preview.ok ? (preview.text || '—') : preview.error}
        </p>
      </div>
    </div>
  );
}

const PivotNotificationVoiceFields = forwardRef(function PivotNotificationVoiceFields({
  titleKey = '',
  bodyKey = '',
  disabled = false,
}, ref) {
  const { data: catalogResponse, loading: catalogLoading } = useFetch(
    '/admin/pivot/copy/catalog',
    { cache: NO_FETCH_CACHE },
  );
  const { data: layersResponse, loading: layersLoading } = useFetch(
    '/admin/pivot/copy',
    { cache: NO_FETCH_CACHE },
  );

  const catalog = useMemo(() => catalogPayload(catalogResponse), [catalogResponse]);
  const layers = useMemo(() => layersPayload(layersResponse), [layersResponse]);
  const resolvedTitle = resolveVoicePath(catalog.keys, titleKey, 'title');
  const resolvedBody = resolveVoicePath(catalog.keys, bodyKey, 'body');

  const titleEntry = catalog.keys.find((row) => row.path === resolvedTitle);
  const bodyEntry = catalog.keys.find((row) => row.path === resolvedBody);
  const titleStored = storedText(layers.entries?.[resolvedTitle], titleEntry?.shipped);
  const bodyStored = storedText(layers.entries?.[resolvedBody], bodyEntry?.shipped);

  const tokenParams = useMemo(() => {
    const tokens = {};
    for (const token of catalog.tokens) {
      const layer = layers.tokens?.[token.name];
      const value = layer?.platform ?? layer?.effective ?? layer?.shipped ?? token.shipped;
      if (value != null && value !== '') tokens[token.name] = value;
    }
    return nestedTokenParams(tokens);
  }, [catalog.tokens, layers.tokens]);

  const [titleDraft, setTitleDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');
  const seededKey = useRef('');

  useEffect(() => {
    if (catalogLoading || layersLoading) return;
    const nextKey = `${resolvedTitle}:${resolvedBody}:${titleStored.text}:${bodyStored.text}`;
    if (seededKey.current === nextKey) return;
    seededKey.current = nextKey;
    setTitleDraft(titleStored.text);
    setBodyDraft(bodyStored.text);
  }, [
    bodyStored.text,
    catalogLoading,
    layersLoading,
    resolvedBody,
    resolvedTitle,
    titleStored.text,
  ]);

  const save = useCallback(async () => {
    const entries = {};
    const pending = [
      {
        known: Boolean(titleEntry),
        path: resolvedTitle,
        draft: titleDraft,
        baseline: titleStored.baseline,
        label: 'Title',
      },
      {
        known: Boolean(bodyEntry),
        path: resolvedBody,
        draft: bodyDraft,
        baseline: bodyStored.baseline,
        label: 'Body',
      },
    ];
    for (const field of pending) {
      if (!field.known || !field.path) continue;
      const next = field.draft.trim();
      if (!next) {
        return {
          ok: false,
          message: `${field.label} is empty. Voice keeps the shipped string instead of storing a blank.`,
        };
      }
      if (next.length > COPY_ENTRY_MAX_LENGTH) {
        return {
          ok: false,
          message: `Keep ${field.label.toLowerCase()} to ${COPY_ENTRY_MAX_LENGTH} characters.`,
        };
      }
      if (next !== field.baseline) entries[field.path] = next;
    }
    if (Object.keys(entries).length) {
      const { data: res, error: reqError } = await authenticatedRequest(WRITE_PATH, {
        method: 'PATCH',
        data: { entries },
        headers: { 'Content-Type': 'application/json' },
      });
      if (reqError || !res?.success) {
        return {
          ok: false,
          message: res?.message || reqError || 'Unable to save voice',
        };
      }
    }
    return {
      ok: true,
      titleKey: resolvedTitle || null,
      bodyKey: resolvedBody || null,
    };
  }, [
    bodyDraft,
    bodyEntry,
    bodyStored.baseline,
    resolvedBody,
    resolvedTitle,
    titleDraft,
    titleEntry,
    titleStored.baseline,
  ]);

  useImperativeHandle(ref, () => ({ save }), [save]);

  return (
    <div className="pivot-notification-copy-fields">
      <CopyField
        label="Title"
        value={titleDraft}
        disabled={disabled || catalogLoading || layersLoading}
        preview={formatPivotCopyTemplate(titleDraft, tokenParams)}
        onChange={(event) => setTitleDraft(event.target.value)}
      />
      <CopyField
        label="Body"
        value={bodyDraft}
        disabled={disabled || catalogLoading || layersLoading}
        preview={formatPivotCopyTemplate(bodyDraft, tokenParams)}
        onChange={(event) => setBodyDraft(event.target.value)}
      />
    </div>
  );
});

export default PivotNotificationVoiceFields;
