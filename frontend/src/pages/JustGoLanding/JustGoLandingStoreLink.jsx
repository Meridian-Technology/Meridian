import React from 'react';
import { handleLandingStoreClick } from './justGoLandingTracking';

export default function JustGoLandingStoreLink({
  tenantKey,
  store = 'ios',
  onClick,
  children,
  ...props
}) {
  return (
    <a
      {...props}
      onClick={(event) => {
        handleLandingStoreClick(event, { tenantKey, store });
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}
