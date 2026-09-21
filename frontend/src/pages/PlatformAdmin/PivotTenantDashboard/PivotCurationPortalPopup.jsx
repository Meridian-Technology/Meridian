/**
 * Catalog popups that carry their own design tokens.
 *
 * Popup portals into document.body. CSS variables inherit down the DOM, not the
 * React tree, and `--pivot-ops-*` is declared on `.pivot-ops` (the tenant page
 * root). Portal content is outside that scope, so page-level queue styles that
 * only read those vars look unstyled.
 *
 * This wrapper is the component Popup receives: it re-declares `.pivot-ops` on
 * the detached tree and loads its own stylesheet next to the portal markup.
 */

import React from 'react';
import Popup from '../../../components/Popup/Popup';
import './PivotCurationPortalPopup.scss';

function CurationPortalBody({ children, handleClose }) {
  const content = React.isValidElement(children)
    ? React.cloneElement(children, { handleClose })
    : children;
  return (
    <div className="pivot-ops pivot-curation-portal-popup__body">
      {content}
    </div>
  );
}

export default function PivotCurationPortalPopup({
  isOpen,
  onClose,
  className = '',
  children,
  ...popupProps
}) {
  if (!isOpen) return null;
  return (
    <Popup
      isOpen={isOpen}
      onClose={onClose}
      customClassName={`pivot-curation-portal-popup ${className}`.trim()}
      {...popupProps}
    >
      <CurationPortalBody>{children}</CurationPortalBody>
    </Popup>
  );
}
