const { parsePrice } = require('./pivotFieldParsingUtils');

const ZERO_DECIMAL_CURRENCIES = new Set([
  'jpy', 'krw', 'vnd', 'clp', 'pyg', 'ugx', 'rwf', 'xaf', 'xof', 'bif', 'djf', 'gnf', 'kmf', 'mga', 'vuv',
]);

/**
 * Guest-facing price label shared by Luma, Partiful, and ordinary sites.
 * Luma stores fiat in cents. Partiful and schema.org offers use major units
 * (dollars, euros). The label is what `parsePrice` turns into `parsed.price`.
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

function priceFromLumaTicketTypes(types) {
  return labelFromQuotes(visibleLumaTiers(types).map(lumaTierQuote));
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
  return labelFromQuotes(usable.map((ticket) => {
    const amount = partifulGuestAmount(ticket);
    const currency = ticket.currency || ticket.currencyCode || 'USD';
    // An empty guest price is Partiful's default for a free ticket.
    const major = amount == null ? 0 : amount;
    return { currency, min: major, max: major, suggested: false };
  }));
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

module.exports = {
  formatMajor,
  majorFromLumaCents,
  priceLabelFromLuma,
  priceFromLumaTicketTypes,
  priceFromLumaTicketInfo,
  priceLabelFromPartiful,
  priceFromJsonLdOffers,
  priceTextFromListing,
};
