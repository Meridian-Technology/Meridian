import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import ImageUpload from '../../components/ImageUpload/ImageUpload';
import { useFetch } from '../../hooks/useFetch';
import apiRequest from '../../utils/postRequest';
import justGoCreatorCopy from './justGoCreatorCopy';
import {
  EMPTY_LISTING_FORM,
  buildListingPayload,
  fieldForServerErrorCode,
  listingToFormState,
  validateListingForm,
} from './justGoCreatorFormUtils';
import { JUSTGO_CREATOR_API_PREFIX } from './justGoCreatorRoutes';
import './JustGoCreatorListingForm.scss';

const TAGS_URL = '/pivot/tags';
const LISTINGS_URL = `${JUSTGO_CREATOR_API_PREFIX}/events`;
const COVER_UPLOAD_URL = '/upload-event-image';

function FieldShell({ id, label, hint, error, children }) {
  return (
    <div className={`jg-field${error ? ' jg-field--invalid' : ''}`}>
      <label className="jg-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="jg-field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="jg-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Shared create / edit form for a Just Go listing.
 *
 * Chrome is reskin register — plain white fields, one orange pill submit. The form deliberately
 * has no lifecycle controls: ops own `ingestStatus` and `batchWeek`, so there is nothing here to
 * publish, stage, or schedule with.
 *
 * @param {object} props
 * @param {'create'|'edit'} props.mode
 * @param {object} [props.event] Serialized creator listing, required for `edit`
 * @param {(result: object) => void} [props.onCreated] Called with the create response `data`
 * @param {() => void} [props.onSaved] Called after a successful edit save
 * @param {() => void} [props.onCancel] Renders a cancel affordance when provided
 */
/**
 * `saveDisabledReason` renders the form fully interactive but refuses to submit, showing the reason
 * instead. Used by local-dev demo mode, where the seeded listing has no server record to write to.
 */
function JustGoCreatorListingForm({
  mode,
  event,
  onCreated,
  onSaved,
  onCancel,
  defaultHostName,
  saveDisabledReason,
}) {
  const copy = justGoCreatorCopy.form;
  const isEdit = mode === 'edit';

  const [form, setForm] = useState(() =>
    isEdit ? listingToFormState(event) : { ...EMPTY_LISTING_FORM, hostName: defaultHostName || '' },
  );
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const errorSummaryRef = useRef(null);

  const { data: tagsData } = useFetch(TAGS_URL);
  const availableTags = useMemo(() => tagsData?.data?.tags ?? [], [tagsData]);

  // Reseed when the underlying listing changes (e.g. after a refetch in the workspace).
  useEffect(() => {
    if (isEdit) setForm(listingToFormState(event));
  }, [isEdit, event]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    setNotice(null);
  };

  const toggleTag = (slug) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(slug)
        ? prev.tags.filter((tag) => tag !== slug)
        : [...prev.tags, slug],
    }));
    setFieldErrors((prev) => (prev.tags ? { ...prev, tags: undefined } : prev));
  };

  /** Cover art can only be attached once the listing has an id, so it uploads after the save. */
  const uploadCover = async (eventId) => {
    const body = new FormData();
    body.append('image', form.coverFile);
    body.append('eventId', eventId);
    const result = await apiRequest(COVER_UPLOAD_URL, body, { method: 'POST' });
    return !result?.error;
  };

  const handleSubmit = async (submitEvent) => {
    submitEvent.preventDefault();
    setFormError(null);
    setNotice(null);

    const { fieldErrors: nextErrors, isValid } = validateListingForm(form);
    setFieldErrors(nextErrors);
    if (!isValid) {
      setFormError(copy.validationSummary);
      errorSummaryRef.current?.focus();
      return;
    }

    // Validation still runs first, so the disabled state can be exercised against a real payload.
    if (saveDisabledReason) {
      setNotice(saveDisabledReason);
      return;
    }

    setSubmitting(true);
    const payload = buildListingPayload(form, { mode });
    const result = isEdit
      ? await apiRequest(`${LISTINGS_URL}/${event._id}`, payload, { method: 'PATCH' })
      : await apiRequest(LISTINGS_URL, payload, { method: 'POST' });

    if (result?.error) {
      const field = fieldForServerErrorCode(result.errorCode);
      if (field) {
        setFieldErrors((prev) => ({ ...prev, [field]: result.error }));
        setFormError(copy.validationSummary);
      } else {
        setFormError(result.error);
      }
      setSubmitting(false);
      errorSummaryRef.current?.focus();
      return;
    }

    const savedId = result?.data?.event?._id || event?._id;
    let coverUploaded = true;
    if (form.coverFile && savedId) {
      coverUploaded = await uploadCover(savedId);
    }

    setSubmitting(false);

    if (isEdit) {
      setNotice(coverUploaded ? copy.savedNotice : copy.coverUploadFailed);
      onSaved?.();
      return;
    }

    onCreated?.({ ...result?.data, coverUploaded });
  };

  const submitLabel = isEdit
    ? submitting
      ? copy.submitEditBusy
      : copy.submitEdit
    : submitting
      ? copy.submitCreateBusy
      : copy.submitCreate;

  return (
    <form className="jg-form" onSubmit={handleSubmit} noValidate>
      {formError ? (
        <p
          className="jg-form__error"
          role="alert"
          tabIndex={-1}
          ref={errorSummaryRef}
        >
          <Icon icon="mdi:alert-circle-outline" />
          {formError}
        </p>
      ) : null}
      {notice ? (
        <p className="jg-form__notice" role="status">
          <Icon icon="mdi:check-circle-outline" />
          {notice}
        </p>
      ) : null}

      <fieldset className="jg-form__section" disabled={submitting}>
        <legend className="jg-form__legend">{copy.sectionBasics}</legend>

        <FieldShell id="jg-name" label={copy.nameLabel} error={fieldErrors.name}>
          <input
            id="jg-name"
            className="jg-input"
            type="text"
            value={form.name}
            placeholder={copy.namePlaceholder}
            onChange={(e) => setField('name', e.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'jg-name-error' : undefined}
          />
        </FieldShell>

        <FieldShell id="jg-description" label={copy.descriptionLabel}>
          <textarea
            id="jg-description"
            className="jg-input jg-input--area"
            rows={4}
            value={form.description}
            placeholder={copy.descriptionPlaceholder}
            onChange={(e) => setField('description', e.target.value)}
          />
        </FieldShell>

        <FieldShell id="jg-location" label={copy.locationLabel} error={fieldErrors.location}>
          <input
            id="jg-location"
            className="jg-input"
            type="text"
            value={form.location}
            placeholder={copy.locationPlaceholder}
            onChange={(e) => setField('location', e.target.value)}
            aria-invalid={Boolean(fieldErrors.location)}
            aria-describedby={fieldErrors.location ? 'jg-location-error' : undefined}
          />
        </FieldShell>
      </fieldset>

      <fieldset className="jg-form__section" disabled={submitting}>
        <legend className="jg-form__legend">{copy.sectionWhen}</legend>

        <div className="jg-form__row">
          <FieldShell id="jg-start" label={copy.startLabel} error={fieldErrors.start}>
            <input
              id="jg-start"
              className="jg-input"
              type="datetime-local"
              value={form.start}
              onChange={(e) => setField('start', e.target.value)}
              aria-invalid={Boolean(fieldErrors.start)}
              aria-describedby={fieldErrors.start ? 'jg-start-error' : undefined}
            />
          </FieldShell>

          <FieldShell
            id="jg-end"
            label={copy.endLabel}
            hint={copy.endHint}
            error={fieldErrors.end}
          >
            <input
              id="jg-end"
              className="jg-input"
              type="datetime-local"
              value={form.end}
              onChange={(e) => setField('end', e.target.value)}
              aria-invalid={Boolean(fieldErrors.end)}
              aria-describedby={fieldErrors.end ? 'jg-end-error' : undefined}
            />
          </FieldShell>
        </div>
      </fieldset>

      <fieldset className="jg-form__section" disabled={submitting}>
        <legend className="jg-form__legend">{copy.sectionHost}</legend>

        <FieldShell
          id="jg-host"
          label={copy.hostNameLabel}
          hint={copy.hostNameHint}
          error={fieldErrors.hostName}
        >
          <input
            id="jg-host"
            className="jg-input"
            type="text"
            value={form.hostName}
            onChange={(e) => setField('hostName', e.target.value)}
            aria-invalid={Boolean(fieldErrors.hostName)}
            aria-describedby={fieldErrors.hostName ? 'jg-host-error' : undefined}
          />
        </FieldShell>

        <FieldShell id="jg-cover" label={copy.coverLabel} hint={copy.coverHint}>
          <ImageUpload
            uploadText={copy.coverUploadText}
            onFileSelect={(file) => setField('coverFile', file)}
            onFileClear={() =>
              setForm((prev) => ({ ...prev, coverFile: null, coverCleared: true }))
            }
            initialImageUrl={form.coverUrl}
            showPrompt={false}
            showActions={false}
            color="var(--jg-accent)"
          />
        </FieldShell>
      </fieldset>

      <fieldset className="jg-form__section" disabled={submitting}>
        <legend className="jg-form__legend">{copy.sectionExtras}</legend>

        <FieldShell
          id="jg-link"
          label={copy.externalLinkLabel}
          hint={copy.externalLinkHint}
          error={fieldErrors.externalLink}
        >
          <input
            id="jg-link"
            className="jg-input"
            type="url"
            value={form.externalLink}
            placeholder={copy.externalLinkPlaceholder}
            onChange={(e) => setField('externalLink', e.target.value)}
            aria-invalid={Boolean(fieldErrors.externalLink)}
            aria-describedby={fieldErrors.externalLink ? 'jg-link-error' : undefined}
          />
        </FieldShell>

        <div className={`jg-field${fieldErrors.tags ? ' jg-field--invalid' : ''}`}>
          <span className="jg-field__label">{copy.tagsLabel}</span>
          {availableTags.length === 0 ? (
            <p className="jg-field__hint">{copy.tagsEmpty}</p>
          ) : (
            <div className="jg-form__tags" role="group" aria-label={copy.tagsLabel}>
              {availableTags.map((tag) => {
                const selected = form.tags.includes(tag.slug);
                return (
                  <button
                    key={tag.slug}
                    type="button"
                    className={`jg-chip${selected ? ' jg-chip--active' : ''}`}
                    aria-pressed={selected}
                    onClick={() => toggleTag(tag.slug)}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          )}
          {fieldErrors.tags ? (
            <p className="jg-field__error" role="alert">
              {fieldErrors.tags}
            </p>
          ) : (
            <p className="jg-field__hint">{copy.tagsHint}</p>
          )}
        </div>
      </fieldset>

      <div className="jg-form__actions">
        <button type="submit" className="justgo-creator__cta" disabled={submitting}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="jg-form__cancel"
            onClick={onCancel}
            disabled={submitting}
          >
            {copy.cancel}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default JustGoCreatorListingForm;
