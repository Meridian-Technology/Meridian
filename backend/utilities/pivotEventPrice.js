const { parsePrice } = require('./pivotFieldParsingUtils');

const ZERO_DECIMAL_CURRENCIES = new Set([
  'jpy', 'krw', 'vnd', 'clp', 'pyg', 'ugx', 'rwf', 'xaf', 'xof', 'bif', 'djf', 'gnf', 'kmf', 'mga', 'vuv',
]);

/**
 * Guest-facing price label shared by Luma, Partiful, and ordinary sites.
 * Luma stores fiat in cents. Partiful and schema.org offers use major units
 * (dollars, euros). The label is what `parsePrice` turns into `parsed.price`.
 *
 * The mobile event screen does not read that label. It reads `event.details`
 * (contract v1): admission, a cent price range, and named tiers.
 */

function finiteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function roundMajor(amount) {
  return Math.round(amount * 100) / 100;
}

function formatMajor(amount, currency = 'USD') {
  const code = String(currency || 'USD').toUpperCase();
  const rounded = roundMajor(amount);
  const digits = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  if (code === 'USD') return `$${digits}`;
  if (code === 'GBP') return `£${digits}`;
  if (code === 'EUR') return `€${digits}`;
  if (code === 'JPY') return `¥${digits}`;
  return `${digits} ${code}`;
}

function majorFromLumaCents(cents, currency) {
  const amount = finiteNumber(cents);
  if (amount == null) return null;
  const code = String(currency || 'usd').toLowerCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return amount;
  return roundMajor(amount / 100);
}

function labelFromBounds({ currency = 'USD', min, max, suggested = false }) {
  const code = String(currency || 'USD').toUpperCase();
  const lo = roundMajor(Math.min(min, max));
  const hi = roundMajor(Math.max(min, max));
  if (lo === 0 && hi === 0) {
    return suggested ? 'Pay what you can' : 'Free';
  }
  const highLabel = formatMajor(hi, code);
  let body = highLabel;
  if (lo === 0) body = `Free–${highLabel}`;
  else if (lo !== hi) body = `${formatMajor(lo, code)}–${highLabel}`;
  return suggested ? `${body} suggested` : body;
}

function labelFromQuotes(quotes) {
  const usable = quotes.filter((quote) => quote && Number.isFinite(quote.min) && Number.isFinite(quote.max));
  if (!usable.length) return null;

  const currencies = [...new Set(usable.map((quote) => String(quote.currency || 'USD').toUpperCase()))];
  const labels = currencies.map((code) => {
    const group = usable.filter((quote) => String(quote.currency || 'USD').toUpperCase() === code);
    return labelFromBounds({
      currency: code,
      min: Math.min(...group.map((quote) => quote.min)),
      max: Math.max(...group.map((quote) => quote.max)),
      suggested: group.some((quote) => quote.suggested),
    });
  });
  return labels.filter(Boolean).join(' · ') || null;
}

function tierName(tier) {
  const name = typeof tier?.name === 'string' ? tier.name.trim() : '';
  return name || null;
}

function withTierName(name, priceLabel) {
  if (!priceLabel) return null;
  if (!name) return priceLabel;
  return `${name} · ${priceLabel}`;
}

function lumaTierQuote(tier) {
  if (!tier || typeof tier !== 'object') return null;
  const type = String(tier.type || '').toLowerCase();
  const currency = tier.currency || 'usd';
  const flexible = tier.is_flexible === true || type === 'flexible' || type === 'donation';
  const amount = majorFromLumaCents(tier.cents, currency);
  const floor = tier.min_cents == null ? null : majorFromLumaCents(tier.min_cents, currency);

  if (type === 'free' || (!flexible && amount == null && floor == null)) {
    return { currency, min: 0, max: 0, suggested: false };
  }
  if (flexible) {
    const suggestedAmount = amount == null ? floor : amount;
    const minimum = floor == null ? 0 : floor;
    if (suggestedAmount == null && minimum == null) {
      return { currency, min: 0, max: 0, suggested: true };
    }
    const hi = suggestedAmount == null ? minimum : suggestedAmount;
    return {
      currency,
      min: Math.min(minimum, hi),
      max: Math.max(minimum, hi),
      suggested: true,
    };
  }
  if (amount == null) return null;
  return { currency, min: amount, max: amount, suggested: false };
}

function visibleLumaTiers(types) {
  if (!Array.isArray(types)) return [];
  const present = types.filter((tier) => tier && typeof tier === 'object');
  const unhidden = present.filter((tier) => tier.is_hidden !== true && tier.hidden !== true);
  const pool = unhidden.length ? unhidden : present;
  const enabled = pool.filter((tier) => tier.is_disabled !== true && tier.disabled !== true);
  const usable = enabled.length ? enabled : pool;
  const publicTiers = usable.filter((tier) => !tier.membership_restriction);
  return publicTiers.length ? publicTiers : usable;
}

function lumaTierLabel(tier) {
  const quote = lumaTierQuote(tier);
  if (!quote) return null;
  return withTierName(tierName(tier), labelFromBounds(quote));
}

/**
 * The event page lists each public ticket. Keep that list. Discover cards only
 * send `ticket_info`, which is already Luma's own min/max summary.
 */
function priceFromLumaTicketTypes(types) {
  const labels = visibleLumaTiers(types).map(lumaTierLabel).filter(Boolean);
  return labels.length ? labels.join(' · ') : null;
}

function lumaInfoMoney(value, fallbackCurrency) {
  if (value == null) return null;
  if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim()))) {
    const currency = fallbackCurrency || 'usd';
    return {
      currency,
      amount: majorFromLumaCents(value, currency),
      flexible: false,
      minAmount: null,
      label: null,
    };
  }
  if (typeof value === 'string') {
    const label = value.trim();
    return label ? { label, currency: fallbackCurrency || 'usd', amount: null, flexible: false, minAmount: null } : null;
  }
  if (typeof value !== 'object') return null;

  const currency = value.currency || fallbackCurrency || 'usd';
  if (value.cents == null && value.amount != null) {
    return {
      currency,
      amount: finiteNumber(value.amount),
      flexible: value.is_flexible === true,
      minAmount: value.min_cents == null ? null : majorFromLumaCents(value.min_cents, currency),
      label: null,
    };
  }
  return {
    currency,
    amount: value.cents == null ? null : majorFromLumaCents(value.cents, currency),
    flexible: value.is_flexible === true,
    minAmount: value.min_cents == null ? null : majorFromLumaCents(value.min_cents, currency),
    label: null,
  };
}

function priceFromLumaTicketInfo(info) {
  if (!info || typeof info !== 'object') return null;
  const price = lumaInfoMoney(info.price, 'usd');
  const maxPrice = lumaInfoMoney(info.max_price ?? info.maxPrice, price?.currency || 'usd');

  if (price?.label && !maxPrice) return price.label;
  if (!price && !maxPrice) {
    if (info.is_free === true || info.isFree === true) return 'Free';
    return null;
  }

  const currency = price?.currency || maxPrice?.currency || 'usd';
  if (price?.flexible) {
    const suggestedAmount = price.amount;
    const floor = price.minAmount == null ? 0 : price.minAmount;
    const hi = suggestedAmount == null ? floor : suggestedAmount;
    return labelFromBounds({
      currency,
      min: Math.min(floor, hi),
      max: Math.max(floor, hi),
      suggested: true,
    });
  }

  const amounts = [price?.amount, maxPrice?.amount].filter((amount) => amount != null);
  if (!amounts.length) {
    if (info.is_free === true || info.isFree === true) return 'Free';
    return price?.label || null;
  }
  return labelFromBounds({
    currency,
    min: Math.min(...amounts),
    max: Math.max(...amounts),
    suggested: false,
  });
}

/**
 * Luma's public event payload and the discover card do not share one price
 * object. Detail pages (`api.luma.com/event/get` and event HTML) carry
 * `ticket_types` (`free`, `paid`, and the older `fiat-price`, plus flexible
 * min/suggested cents). Discover cards carry `ticket_info` instead.
 */
function priceLabelFromLuma(source) {
  if (!source || typeof source !== 'object') return null;
  const types = source.ticket_types || source.ticketTypes || source.event?.ticket_types;
  const fromTypes = priceFromLumaTicketTypes(types);
  if (fromTypes) return fromTypes;

  const info = source.ticket_info || source.ticketInfo || source.event?.ticket_info;
  const fromInfo = priceFromLumaTicketInfo(info);
  if (fromInfo) return fromInfo;

  return priceFromJsonLdOffers(source.offers);
}

function partifulGuestAmount(ticket) {
  const guest = finiteNumber(ticket.guestPrice ?? ticket.price ?? ticket.amount);
  if (guest != null) return guest;
  return finiteNumber(ticket.priceExcludingFees);
}

function partifulTicketLists(event, pageProps = {}) {
  const ticketing = event?.ticketing;
  return [
    event?.ticketTypes,
    event?.publicTicketTypes,
    ticketing?.ticketTypes,
    ticketing?.publicTicketTypes,
    pageProps?.ticketTypes,
    pageProps?.publicTicketTypes,
  ].flatMap((list) => (Array.isArray(list) ? list : []));
}

function priceFromPartifulTicketTypes(types) {
  if (!Array.isArray(types) || !types.length) return null;
  const named = types.filter((ticket) => ticket && typeof ticket === 'object' && (ticket.name || ticket.id));
  const enabled = named.filter((ticket) => ticket.disabled !== true);
  const usable = enabled.length ? enabled : named;
  const labels = usable.map((ticket) => {
    const amount = partifulGuestAmount(ticket);
    const currency = ticket.currency || ticket.currencyCode || 'USD';
    // An empty guest price is Partiful's default for a free ticket.
    const major = amount == null ? 0 : amount;
    return withTierName(tierName(ticket), labelFromBounds({
      currency,
      min: major,
      max: major,
      suggested: false,
    }));
  }).filter(Boolean);
  return labels.length ? labels.join(' · ') : null;
}

function priceFromPartifulChipIn(ticketing) {
  if (!ticketing || typeof ticketing !== 'object') return null;
  const type = typeof ticketing.type === 'string' ? ticketing.type.toLowerCase() : null;
  if (type === 'standard') return null;
  if (type && type !== 'chip_in') return null;

  const mode = typeof ticketing.mode === 'string' ? ticketing.mode.toLowerCase() : null;
  const looksLikeChipIn = type === 'chip_in' || mode === 'optional' || mode === 'required' || ticketing.price != null;
  if (!looksLikeChipIn) return null;
  if (mode && mode !== 'optional' && mode !== 'required') return null;

  const currency = ticketing.currency || ticketing.currencyCode || 'USD';
  const price = finiteNumber(ticketing.price);
  const optional = mode === 'optional' || (mode == null && type === 'chip_in' && price == null);
  if (optional && (price == null || price === 0)) return 'Pay what you can';
  if (optional && price != null) return labelFromBounds({ currency, min: price, max: price, suggested: true });
  if (price == null) return null;
  if (price === 0) return 'Free';
  return `${formatMajor(price, currency)} per person`;
}

function priceFromPartifulCost(cost) {
  if (typeof cost !== 'string') return null;
  const text = cost.trim();
  if (!text) return null;
  if (/^\${1,4}$/.test(text) || parsePrice(text)) return text;
  return null;
}

/**
 * Partiful has two payment shapes, and a guest page may carry either.
 * Chip In is `ticketing.type` of `chip_in` (or a legacy object with no type)
 * and `mode` `optional` or `required`. Ticket sales are `type: "standard"`
 * plus ticket types from the create/update mutations: `guestPrice` is what
 * guests pay, `priceExcludingFees` is the host payout.
 */
function priceLabelFromPartiful(event, pageProps = {}) {
  if (!event || typeof event !== 'object') {
    return priceFromJsonLdOffers(pageProps?.offersJsonLd);
  }

  const ticketing = event.ticketing;
  const standard = ticketing && String(ticketing.type || '').toLowerCase() === 'standard';
  const fromTickets = priceFromPartifulTicketTypes(partifulTicketLists(event, pageProps));
  if (standard || fromTickets) {
    if (fromTickets) return fromTickets;
  }

  const fromChipIn = priceFromPartifulChipIn(ticketing);
  if (fromChipIn) return fromChipIn;

  return priceFromJsonLdOffers(pageProps?.offersJsonLd)
    || priceFromJsonLdOffers(event.offers)
    || priceFromPartifulCost(event.cost)
    || null;
}

function offerNodes(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach((entry) => offerNodes(entry, out));
    return out;
  }
  if (typeof node !== 'object') return out;

  const type = node['@type'] || node.type;
  const typeName = Array.isArray(type) ? type.join(' ') : String(type || '');
  const looksLikeOffer = /offer/i.test(typeName)
    || node.price != null
    || node.lowPrice != null
    || node.highPrice != null;
  if (looksLikeOffer) out.push(node);
  if (node.offers) offerNodes(node.offers, out);
  if (node['@graph']) offerNodes(node['@graph'], out);
  return out;
}

function offerQuote(offer) {
  const currency = offer.priceCurrency
    || offer.priceSpecification?.priceCurrency
    || 'USD';
  const low = finiteNumber(offer.lowPrice);
  const high = finiteNumber(offer.highPrice);
  if (low != null || high != null) {
    const lo = low == null ? high : low;
    const hi = high == null ? low : high;
    return { currency, min: lo, max: hi, suggested: false };
  }

  const price = offer.price ?? offer.priceSpecification?.price;
  if (typeof price === 'string' && /\bfree\b/i.test(price) && !/\d/.test(price)) {
    return { currency, min: 0, max: 0, suggested: false };
  }
  const amount = finiteNumber(price);
  if (amount == null) return null;
  return { currency, min: amount, max: amount, suggested: false };
}

function priceFromJsonLdOffers(offers) {
  return labelFromQuotes(offerNodes(offers).map(offerQuote));
}

/**
 * Ordinary sites rarely share a schema. Use an explicit extracted price when
 * the model found one; otherwise keep a short price phrase from the listing
 * copy. A long description that merely says "free" is left alone.
 */
function priceTextFromOneListing(text) {
  const parsed = parsePrice(text);
  if (!parsed) return null;

  const hasMoney = /[$£€¥]\s*\d|\d+(?:[.,]\d+)?\s*(?:usd|eur|gbp|cad|aud|nzd|chf|jpy|sgd|hkd|mxn|brl|inr|krw|usdc|sol|eth|btc)\b|\b(?:usd|eur|gbp|cad|aud|usdc|sol|eth|btc)\s*\d/i.test(text);
  if (!hasMoney) {
    // A title that merely contains "free" is not a ticket price.
    if (/^(free|no cover|complimentary|free entry|free admission|pay what you can|pwyw|donation|sliding scale)\b[.!\s]*$/i.test(text)) {
      return text;
    }
    return null;
  }

  if (text.length <= 80) return text;
  if (parsed.min == null || parsed.max == null) return null;
  return labelFromBounds({
    currency: parsed.currency,
    min: parsed.min,
    max: parsed.max,
    suggested: parsed.suggested,
  });
}

function priceTextFromListing(...parts) {
  for (const part of parts) {
    if (typeof part !== 'string' || !part.trim()) continue;
    const label = priceTextFromOneListing(part.trim());
    if (label) return label;
  }
  return null;
}

const ADMISSIONS = new Set(['free', 'rsvp', 'paid', 'donation', 'pay_at_door']);
const TIER_KINDS = new Set([
  'general', 'early_bird', 'vip', 'student', 'group', 'table', 'door', 'donation', 'free', 'other',
]);
const SALES_STATUSES = new Set([
  'on_sale', 'few_left', 'sold_out', 'waitlist', 'not_yet_on_sale', 'sales_ended',
]);

function ticketProviderName(source) {
  const value = String(source || '').trim().toLowerCase();
  if (value === 'luma') return 'Luma';
  if (value === 'partiful') return 'Partiful';
  return null;
}

function moneyFromMajor(amount, currency) {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return null;
  const code = String(currency || 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  const minor = ZERO_DECIMAL_CURRENCIES.has(code.toLowerCase())
    ? Math.round(amount)
    : Math.round(roundMajor(amount) * 100);
  if (!Number.isInteger(minor) || minor < 0 || minor > 100000000) return null;
  return { amountMinor: minor, currency: code };
}

function normalizeMoney(value) {
  if (!value || typeof value !== 'object') return null;
  const code = typeof value.currency === 'string' ? value.currency.trim().toUpperCase() : '';
  if (!Number.isInteger(value.amountMinor) || value.amountMinor < 0 || value.amountMinor > 100000000) {
    return null;
  }
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return { amountMinor: value.amountMinor, currency: code };
}

function tierKindFromName(name, { free = false, donation = false } = {}) {
  if (donation) return 'donation';
  if (free) return 'free';
  const text = String(name || '').toLowerCase();
  if (/\bvip\b/.test(text)) return 'vip';
  if (/early[\s-]?bird/.test(text)) return 'early_bird';
  if (/student/.test(text)) return 'student';
  if (/\btable\b/.test(text)) return 'table';
  if (/\bgroup\b/.test(text)) return 'group';
  if (/\bdoor\b/.test(text)) return 'door';
  if (/donat|chip[\s-]?in|sliding|pay what you can|\bpwyw\b/.test(text)) return 'donation';
  if (/\b(general|ga|standard|admission|regular|ticket|rsvp)\b/.test(text)) return 'general';
  return 'other';
}

function tierId(rawId, name, index) {
  if (typeof rawId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(rawId)) return rawId;
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'tier'}-${index}`;
}

function normalizeTier(tier, index) {
  if (!tier || typeof tier !== 'object') return null;
  const name = typeof tier.name === 'string' ? tier.name.trim() : '';
  if (!name) return null;
  const price = normalizeMoney(tier.price);
  const maxPrice = normalizeMoney(tier.maxPrice);
  const status = SALES_STATUSES.has(tier.status) ? tier.status : null;
  const requirement = typeof tier.requirement === 'string' && tier.requirement.trim()
    ? tier.requirement.trim().slice(0, 120)
    : null;
  return {
    id: tierId(tier.id, name, index),
    name: name.slice(0, 80),
    kind: TIER_KINDS.has(tier.kind) ? tier.kind : 'other',
    ...(price ? { price } : {}),
    ...(maxPrice
      && (!price || maxPrice.currency === price.currency)
      && maxPrice.amountMinor >= (price ? price.amountMinor : 0)
      ? { maxPrice }
      : {}),
    ...(status ? { status } : {}),
    ...(requirement ? { requirement } : {}),
  };
}

function priceRangeFromTiers(tiers) {
  const sample = tiers.find((tier) => tier.price || tier.maxPrice);
  const currency = sample?.price?.currency || sample?.maxPrice?.currency;
  if (!currency) return null;
  const amounts = [];
  for (const tier of tiers) {
    const price = tier.price?.currency === currency ? tier.price.amountMinor : null;
    const maxPrice = tier.maxPrice?.currency === currency ? tier.maxPrice.amountMinor : null;
    if (price == null && maxPrice == null) {
      amounts.push(0);
      continue;
    }
    if (price != null) amounts.push(price);
    if (maxPrice != null) {
      if (price == null) amounts.push(0);
      amounts.push(maxPrice);
    }
  }
  if (!amounts.length) return null;
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  if (min === 0 && max === 0) return null;
  return {
    min: { amountMinor: min, currency },
    ...(max > min ? { max: { amountMinor: max, currency } } : {}),
  };
}

function admissionFromTiers(tiers, ticketProvider) {
  const priced = tiers.some((tier) =>
    (tier.price && tier.price.amountMinor > 0) || (tier.maxPrice && tier.maxPrice.amountMinor > 0));
  if (!priced) return ticketProvider ? 'rsvp' : 'free';
  if (tiers.every((tier) => tier.kind === 'donation')) return 'donation';
  return 'paid';
}

function finishDetails(tiers, ticketProvider) {
  const usable = tiers.filter(Boolean).slice(0, 12);
  if (!usable.length) return null;
  const provider = ticketProviderName(ticketProvider);
  const priced = usable.some((tier) =>
    (tier.price && tier.price.amountMinor > 0) || (tier.maxPrice && tier.maxPrice.amountMinor > 0));
  const notable = usable.some((tier) => tier.status || tier.requirement);
  // A plain free RSVP stays admission-only, so the screen keeps its register
  // button. A sold-out or members-only free tier is still worth showing.
  if (!priced && !notable) {
    return normalizeEventDetails({
      version: 1,
      admission: provider ? 'rsvp' : 'free',
      ...(provider ? { ticketProvider: provider } : {}),
    });
  }
  const priceRange = priceRangeFromTiers(usable);
  return normalizeEventDetails({
    version: 1,
    admission: admissionFromTiers(usable, provider),
    ...(provider ? { ticketProvider: provider } : {}),
    ...(priceRange ? { priceRange } : {}),
    tiers: usable,
  });
}

function normalizeEventDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.version != null && value.version !== 1) return null;
  const tiers = Array.isArray(value.tiers)
    ? value.tiers.map(normalizeTier).filter(Boolean).slice(0, 12)
    : [];
  const admission = ADMISSIONS.has(value.admission) ? value.admission : null;
  const min = normalizeMoney(value.priceRange?.min);
  const max = normalizeMoney(value.priceRange?.max);
  const explicitRange = min
    ? (max && max.currency === min.currency && max.amountMinor >= min.amountMinor
      ? { min, max }
      : { min })
    : null;
  const priceRange = explicitRange || priceRangeFromTiers(tiers);
  const ticketProvider = ticketProviderName(value.ticketProvider)
    || (typeof value.ticketProvider === 'string' && value.ticketProvider.trim()
      ? value.ticketProvider.trim().slice(0, 40)
      : null);
  if (!admission && !priceRange && !tiers.length) return null;
  return {
    version: 1,
    ...(admission ? { admission } : {}),
    ...(ticketProvider ? { ticketProvider } : {}),
    ...(priceRange ? { priceRange } : {}),
    ...(tiers.length ? { tiers } : {}),
  };
}

function tierFromQuote(name, quote, index, extra = {}) {
  if (!quote) return null;
  const free = quote.min === 0 && quote.max === 0 && !quote.suggested;
  const sliding = quote.suggested || quote.min !== quote.max;
  let price = null;
  let maxPrice = null;
  if (sliding) {
    if (quote.min > 0) price = moneyFromMajor(quote.min, quote.currency);
    if (quote.max > quote.min) maxPrice = moneyFromMajor(quote.max, quote.currency);
    else if (quote.suggested && quote.max > 0) price = moneyFromMajor(quote.max, quote.currency);
  } else if (quote.min > 0) {
    price = moneyFromMajor(quote.min, quote.currency);
  }
  return normalizeTier({
    id: extra.id,
    name,
    kind: tierKindFromName(name, { free, donation: quote.suggested }),
    price,
    maxPrice,
    status: extra.status,
    requirement: extra.requirement,
  }, index);
}

function detailsFromParsed(parsed, { admission, ticketProvider } = {}) {
  if (!parsed && !admission) return null;
  const provider = ticketProviderName(ticketProvider);
  let resolved = ADMISSIONS.has(admission) ? admission : null;
  if (!resolved && parsed) {
    if (parsed.isFree) resolved = provider ? 'rsvp' : 'free';
    else if (parsed.suggested) resolved = 'donation';
    else if (parsed.min == null || parsed.max == null) resolved = null;
    else resolved = 'paid';
  }
  let priceRange = null;
  if (parsed && parsed.min != null && parsed.max != null && !(parsed.min === 0 && parsed.max === 0)) {
    const min = moneyFromMajor(parsed.min, parsed.currency);
    const max = parsed.max > parsed.min ? moneyFromMajor(parsed.max, parsed.currency) : null;
    if (min) priceRange = max ? { min, max } : { min };
  }
  return normalizeEventDetails({
    version: 1,
    ...(resolved ? { admission: resolved } : {}),
    ...(provider ? { ticketProvider: provider } : {}),
    ...(priceRange ? { priceRange } : {}),
  });
}

function eventDetailsFromPriceText(text, options = {}) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return null;
  const ticketProvider = options.ticketProvider;

  if (/\b(at the door|door price|pay at the door|pay at door)\b/i.test(raw)) {
    return detailsFromParsed(parsePrice(raw), { admission: 'pay_at_door', ticketProvider });
  }

  const tokens = raw.split(/\s·\s/).map((token) => token.trim()).filter(Boolean);
  if (tokens.length >= 2 && tokens.length % 2 === 0) {
    const pairs = [];
    let paired = true;
    for (let index = 0; index < tokens.length; index += 2) {
      const name = tokens[index];
      const price = parsePrice(tokens[index + 1]);
      const nameIsPrice = parsePrice(name);
      if (!name || !price || nameIsPrice || tokens[index + 1].length > 40) {
        paired = false;
        break;
      }
      pairs.push({ name, price });
    }
    if (paired) {
      const tiers = pairs.map((pair, index) => tierFromQuote(pair.name, {
        currency: pair.price.currency,
        min: pair.price.min,
        max: pair.price.max,
        suggested: pair.price.suggested,
      }, index)).filter(Boolean);
      const finished = finishDetails(tiers, ticketProvider);
      if (finished) return finished;
    }
  }

  return detailsFromParsed(parsePrice(raw), { ticketProvider });
}

function lumaTierDetails(tier, index) {
  const quote = lumaTierQuote(tier);
  if (!quote) return null;
  const free = quote.min === 0 && quote.max === 0 && !quote.suggested;
  const name = tierName(tier) || (free ? 'RSVP' : 'Ticket');
  return tierFromQuote(name, quote, index, {
    id: tier.api_id || tier.id,
    status: tier.is_disabled === true || tier.disabled === true ? 'sold_out' : undefined,
    requirement: tier.membership_restriction ? 'Members only' : undefined,
  });
}

function eventDetailsFromOffers(offers, ticketProvider) {
  const named = [];
  offerNodes(offers).forEach((offer, index) => {
    const name = tierName(offer);
    const quote = offerQuote(offer);
    if (!name || !quote) return;
    const tier = tierFromQuote(name, quote, named.length);
    if (tier) named.push(tier);
  });
  if (named.length) return finishDetails(named, ticketProvider);
  return eventDetailsFromPriceText(priceFromJsonLdOffers(offers), { ticketProvider });
}

/**
 * Ticket options in the mobile details shape. Named Luma tiers stay tiers.
 * A discover `ticket_info` summary stays a price range, because Luma does
 * not send tier names on that card.
 */
function eventDetailsFromLuma(source) {
  if (!source || typeof source !== 'object') return null;
  const types = source.ticket_types || source.ticketTypes || source.event?.ticket_types;
  const tiers = visibleLumaTiers(types).map(lumaTierDetails).filter(Boolean);
  if (tiers.length) return finishDetails(tiers, 'Luma');

  const info = source.ticket_info || source.ticketInfo || source.event?.ticket_info;
  const fromInfo = eventDetailsFromPriceText(priceFromLumaTicketInfo(info), { ticketProvider: 'Luma' });
  if (fromInfo) return fromInfo;
  return eventDetailsFromOffers(source.offers, 'Luma');
}

function partifulTierDetails(ticket, index) {
  const amount = partifulGuestAmount(ticket);
  const major = amount == null ? 0 : amount;
  const name = tierName(ticket) || (major === 0 ? 'RSVP' : 'Ticket');
  return tierFromQuote(name, {
    currency: ticket.currency || ticket.currencyCode || 'USD',
    min: major,
    max: major,
    suggested: false,
  }, index, {
    id: ticket.id,
    status: ticket.disabled === true ? 'sold_out' : undefined,
  });
}

function eventDetailsFromPartiful(event, pageProps = {}) {
  if (!event || typeof event !== 'object') {
    return eventDetailsFromOffers(pageProps?.offersJsonLd, 'Partiful');
  }

  const ticketing = event.ticketing;
  const standard = ticketing && String(ticketing.type || '').toLowerCase() === 'standard';
  const named = partifulTicketLists(event, pageProps)
    .filter((ticket) => ticket && typeof ticket === 'object' && (ticket.name || ticket.id));
  const enabled = named.filter((ticket) => ticket.disabled !== true);
  const tiers = (enabled.length ? enabled : named).map(partifulTierDetails).filter(Boolean);
  if ((standard || tiers.length) && tiers.length) return finishDetails(tiers, 'Partiful');

  const fromChipIn = eventDetailsFromPriceText(priceFromPartifulChipIn(ticketing), {
    ticketProvider: 'Partiful',
  });
  if (fromChipIn) return fromChipIn;

  return eventDetailsFromOffers(pageProps?.offersJsonLd, 'Partiful')
    || eventDetailsFromOffers(event.offers, 'Partiful')
    || eventDetailsFromPriceText(priceFromPartifulCost(event.cost), { ticketProvider: 'Partiful' });
}

function eventDetailsForFeed(pivot) {
  if (!pivot || typeof pivot !== 'object') return null;
  return normalizeEventDetails(pivot.details)
    || eventDetailsFromPriceText(pivot.parsed?.price?.raw, { ticketProvider: pivot.source });
}

module.exports = {
  formatMajor,
  majorFromLumaCents,
  priceLabelFromLuma,
  priceFromLumaTicketTypes,
  priceFromLumaTicketInfo,
  priceLabelFromPartiful,
  priceFromJsonLdOffers,
  priceTextFromListing,
  normalizeEventDetails,
  eventDetailsFromLuma,
  eventDetailsFromPartiful,
  eventDetailsFromPriceText,
  eventDetailsForFeed,
};
