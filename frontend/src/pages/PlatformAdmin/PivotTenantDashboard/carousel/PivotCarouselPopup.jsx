/**
 * A popup that carries its own design tokens.
 *
 * Popup renders through a portal into document.body, and CSS custom properties
 * inherit down the DOM tree rather than the React tree. Everything the carousel
 * uses is declared on an ancestor class — `--pivot-ops-*` on `.pivot-ops`,
 * which PivotTenantPage puts on its root — so content in a portal sits outside
 * that scope and every var() inside it resolves to nothing.
 *
 * Re-declaring the class on the portal's own root is the whole fix: the tokens
 * are defined again at the top of the detached tree, and the ops components
 * inside render exactly as they do on a page.
 *
 * `.jgz` is deliberately not added. It would bring the light table's lowercase
 * transform and mono face with it, and a popup is chrome around the zine rather
 * than a part of it.
 *
 * Outside-click dismissal is off, and that is load-bearing rather than a
 * preference. Popup closes on a document-level mousedown outside its own
 * content node, and a nested Popup — the voice panel's save confirmation — is
 * portaled to document.body, so it is outside by that test. Pressing Confirm
 * would close this popup on mousedown and unmount the confirmation before its
 * click ever landed: the save silently never happened. These are working
 * surfaces besides, where a stray click should not discard a search or an edit.
 * The close button is the way out.
 */

import React from 'react';
import Popup from '../../../../components/Popup/Popup';
import './PivotCarouselPopup.scss';

function PopupBody({ children }) {
  return <div className="pivot-ops jgz-popup__body">{children}</div>;
}

export default function PivotCarouselPopup({ open, onClose, className = '', children }) {
  if (!open) return null;

  return (
    <Popup
      isOpen={open}
      onClose={onClose}
      customClassName={`jgz-popup ${className}`}
      disableOutsideClick
    >
      <PopupBody>{children}</PopupBody>
    </Popup>
  );
}
