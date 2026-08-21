const publicUrl = process.env.PUBLIC_URL || '';

/** Full square court photo (1024×1024 → WebP). */
export const JUSTGO_HERO_DESKTOP_WEBP = `${publicUrl}/justgo/hero-court.webp`;

/**
 * 9:16 crop of the same frame for phones.
 * Source is 1024×1024; mobile takes a 576×1024 column from x=192 (18.75%–75%)
 * so the maroon driver, ball, and trailing defender stay in frame and the
 * grey wall above them is left for the wordmark. A centered cover crop of the
 * square would clip both motion trails and the ball.
 */
export const JUSTGO_HERO_MOBILE_WEBP = `${publicUrl}/justgo/hero-court-mobile.webp`;

export const JUSTGO_WORDMARK_1298 = `${publicUrl}/justgo/wordmark-1298.png`;
export const JUSTGO_WORDMARK_1624 = `${publicUrl}/justgo/wordmark-1624.png`;
export const JUSTGO_WORDMARK_SRCSET = `${JUSTGO_WORDMARK_1298} 1298w, ${JUSTGO_WORDMARK_1624} 1624w`;
/** Matches `.justgo-landing__wordmark` max width. */
export const JUSTGO_WORDMARK_SIZES = 'min(90vw, 52rem)';
