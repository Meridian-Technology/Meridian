const APPLE_ID_SCRIPT =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

let appleIdScriptPromise;

/** Load Apple's Sign In JS only on pages that actually sign in. */
export function ensureAppleIdScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.AppleID) return Promise.resolve();
  if (appleIdScriptPromise) return appleIdScriptPromise;

  appleIdScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${APPLE_ID_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Apple Sign In failed to load')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.src = APPLE_ID_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      appleIdScriptPromise = undefined;
      reject(new Error('Apple Sign In failed to load'));
    };
    document.head.appendChild(script);
  });

  return appleIdScriptPromise;
}

export function initAppleIdAuth(options) {
  if (typeof window === 'undefined' || !window.AppleID?.auth) return;
  window.AppleID.auth.init(options);
}
