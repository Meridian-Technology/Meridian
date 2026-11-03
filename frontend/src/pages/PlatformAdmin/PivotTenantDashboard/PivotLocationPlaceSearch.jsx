import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { authenticatedRequest } from '../../../hooks/useFetch';

const SEARCH_DEBOUNCE_MS = 250;

function placesUrl(tenantKey, suffix) {
  return `/admin/platform/tenants/${tenantKey}/rich-location-migration/places/${suffix}`;
}

/**
 * Lets a reviewer type a venue or address and pick the exact Google listing.
 * Suggestions are biased to the city; the picked place comes back fully
 * resolved, with `inScope` so the inspector can warn before it is saved.
 */
export default function PivotLocationPlaceSearch({ tenantKey, originalInput, disabled, onPick }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  // Filling the box with the picked place's name must not search again.
  const skipSearch = useRef(false);

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return undefined;
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return undefined;
    }
    const id = requestId.current + 1;
    requestId.current = id;
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data, error: requestError } = await authenticatedRequest(
        placesUrl(tenantKey, 'search'),
        { params: { q: trimmed } },
      );
      if (requestId.current !== id) return;
      setSearching(false);
      if (requestError || !data?.success) {
        setError(data?.message || requestError || 'Google search failed.');
        setSuggestions([]);
        return;
      }
      setError('');
      setSuggestions(data.data?.suggestions || []);
      setHighlighted(-1);
      setOpen(true);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, tenantKey]);

  const pick = async (suggestion) => {
    setOpen(false);
    setResolving(true);
    const { data, error: requestError } = await authenticatedRequest(
      placesUrl(tenantKey, encodeURIComponent(suggestion.placeId)),
      { params: { originalInput } },
    );
    setResolving(false);
    if (requestError || !data?.success) {
      setError(data?.message || requestError || 'Google could not load that place.');
      return;
    }
    setError('');
    skipSearch.current = true;
    setQuery(suggestion.fullText || suggestion.primaryText);
    onPick(data.data);
  };

  const onKeyDown = (event) => {
    if (!open || !suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter' && highlighted >= 0) {
      event.preventDefault();
      pick(suggestions[highlighted]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="pivot-location-review__search">
      <label className="pivot-location-review__field">
        <span>Search Google yourself</span>
        <div className="pivot-location-review__search-input">
          <Icon icon={resolving || searching ? 'mdi:loading' : 'mdi:magnify'} />
          <input
            className="linear-input"
            type="search"
            role="combobox"
            aria-label="Search Google for a place"
            aria-expanded={open && suggestions.length > 0}
            aria-controls="pivot-location-review-suggestions"
            aria-autocomplete="list"
            placeholder="Venue name or street address"
            value={query}
            disabled={disabled || resolving}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
          />
        </div>
      </label>
      {open && suggestions.length ? (
        <ul id="pivot-location-review-suggestions" role="listbox" className="pivot-location-review__suggestions">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.placeId}
              role="option"
              aria-selected={index === highlighted}
              className={index === highlighted ? 'is-active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(suggestion)}
            >
              <strong>{suggestion.primaryText}</strong>
              {suggestion.secondaryText ? <small>{suggestion.secondaryText}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <small className="pivot-location-review__search-error" role="alert">{error}</small> : null}
    </div>
  );
}
