import React from 'react';
import { cityChipLabel } from './justGoLandingUtils';
import { useJustGoLandingCopy } from './justGoLandingCopy';

export default function JustGoLandingCityPicker({
  cities = [],
  selectedTenantKey = '',
  onChange,
  className = 'justgo-landing-deck__cities',
}) {
  const copy = useJustGoLandingCopy();
  if (!Array.isArray(cities) || cities.length === 0) return null;

  return (
    <div className={className} role="listbox" aria-label={copy.cityPickerLabel}>
      {cities.map((city) => {
        const label = cityChipLabel(city);
        if (!label) return null;
        const selected = city.tenantKey === selectedTenantKey;
        return (
          <button
            key={city.tenantKey}
            type="button"
            role="option"
            aria-selected={selected}
            className={
              selected
                ? 'justgo-landing-deck__city justgo-landing-deck__city--on'
                : 'justgo-landing-deck__city'
            }
            onClick={() => onChange?.(city.tenantKey)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
