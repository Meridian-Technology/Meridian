import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import IphoneDeviceFrame from '../../../components/IphoneDeviceFrame';
import './PivotDeckCardPreview.scss';

const STACK_BEHIND = [
  { depth: 2, rotate: -2.2, scale: 0.976, offsetY: 10, offsetX: -6 },
  { depth: 1, rotate: 2.6, scale: 0.984, offsetY: 5, offsetX: 5 },
];

function normalizeDeckCopy(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function PivotDeckCardPreview({
  title,
  hostName,
  whenLabel,
  locationLabel,
  description,
  imageUrl,
  tagLabel,
  className = '',
}) {
  const displayTitle = normalizeDeckCopy(title) || 'untitled event';
  const displayHost = normalizeDeckCopy(hostName) || 'organizer tbd';

  return (
    <article className={`pivot-deck-card ${className}`.trim()} aria-label="Deck card preview">
      <div
        className={`pivot-deck-card__hero${imageUrl ? ' pivot-deck-card__hero--has-image' : ''}`}
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
      />
      <div className="pivot-deck-card__body">
        {tagLabel ? <span className="pivot-deck-card__tag">{normalizeDeckCopy(tagLabel)}</span> : null}
        <h3 className="pivot-deck-card__title">{displayTitle}</h3>
        <p className="pivot-deck-card__host">{displayHost}</p>
        {whenLabel || locationLabel ? (
          <div className="pivot-deck-card__meta">
            {whenLabel ? <span className="pivot-deck-card__pill pivot-deck-card__pill--when">{whenLabel}</span> : null}
            {locationLabel ? (
              <span className="pivot-deck-card__pill pivot-deck-card__pill--where">{locationLabel}</span>
            ) : null}
          </div>
        ) : null}
        {description ? <p className="pivot-deck-card__description">{description.trim()}</p> : null}
      </div>
    </article>
  );
}

export function PivotDeckPhonePreview({
  title,
  hostName,
  whenLabel,
  locationLabel,
  description,
  imageUrl,
  tagLabel,
  label = 'Mobile deck preview',
  hint = 'Matches the swipe deck card in the Pivot app.',
}) {
  return (
    <IphoneDeviceFrame
      label={label}
      hint={hint}
      ariaLabel={label}
      width={320}
      className="pivot-deck-phone"
      screenClassName="pivot-deck-phone__screen"
      statusBarTheme="dark"
    >
      <div className="pivot-deck-phone__stage">
        {STACK_BEHIND.map((layer) => (
          <div
            key={layer.depth}
            className="pivot-deck-card pivot-deck-card--ghost"
            style={{
              transform: `translate(${layer.offsetX}px, ${layer.offsetY}px) rotate(${layer.rotate}deg) scale(${layer.scale})`,
            }}
          />
        ))}
        <PivotDeckCardPreview
          title={title}
          hostName={hostName}
          whenLabel={whenLabel}
          locationLabel={locationLabel}
          description={description}
          imageUrl={imageUrl}
          tagLabel={tagLabel}
          className="pivot-deck-card--focus"
        />
      </div>
    </IphoneDeviceFrame>
  );
}

export function DeckPreviewModal({ previewProps, hint, onClose }) {
  useEffect(() => {
    if (!previewProps) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, previewProps]);

  if (!previewProps) {
    return null;
  }

  return createPortal(
    <div className="pivot-lab__deck-modal" role="presentation" onClick={onClose}>
      <div
        className="pivot-lab__deck-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Deck preview"
        onClick={(event) => event.stopPropagation()}
      >
        <PivotDeckPhonePreview {...previewProps} hint={hint} />
        <div className="pivot-lab__deck-modal-actions">
          <button type="button" className="linear-btn linear-btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default PivotDeckPhonePreview;
