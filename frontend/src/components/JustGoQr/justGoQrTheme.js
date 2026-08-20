export const JUSTGO_QR_DEFAULT_FG = '#1A1714';
export const JUSTGO_QR_DEFAULT_BG = '#FAF6EF';
export const JUSTGO_QR_CAMPUS_GREEN = '#4DAA57';

export const JUSTGO_QR_SWATCHES = Object.freeze([
  { label: 'just go ink', value: '#1A1714' },
  { label: 'white', value: '#FFFFFF' },
  { label: 'accent', value: '#FF4F1F' },
  { label: 'burst', value: '#FF2A2A' },
  { label: 'pop', value: '#FFD23F' },
  { label: 'ticker', value: '#4AB5FF' },
]);

const QR_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeLandingQrNameInput(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidLandingQrName(value) {
  const slug = normalizeLandingQrNameInput(value);
  return QR_NAME_PATTERN.test(slug);
}

export function justGoQrFilename(name, format = 'png') {
  const slug = normalizeLandingQrNameInput(name) || 'qr';
  const ext = format === 'svg' ? 'svg' : 'png';
  return `justgo-qr-${slug}.${ext}`;
}

export function justGoQrOptions(
  url,
  {
    size = 240,
    type = 'svg',
    fgColor = JUSTGO_QR_DEFAULT_FG,
    bgColor = JUSTGO_QR_DEFAULT_BG,
    transparentBg = true,
    dotType = 'extra-rounded',
    cornerType = 'extra-rounded',
  } = {},
) {
  const corners = cornerType === 'dot' ? 'dot' : cornerType || 'extra-rounded';
  return {
    width: size,
    height: size,
    type,
    data: url,
    dotsOptions: { color: fgColor, type: dotType || 'extra-rounded' },
    backgroundOptions: { color: transparentBg ? 'transparent' : bgColor },
    cornersSquareOptions: { type: corners, color: fgColor },
    cornersDotOptions: { type: corners, color: fgColor },
  };
}

export async function downloadJustGoQr(
  url,
  {
    filename,
    format = 'png',
    fgColor = JUSTGO_QR_DEFAULT_FG,
    bgColor = JUSTGO_QR_DEFAULT_BG,
    transparentBg = true,
    dotType = 'extra-rounded',
    cornerType = 'extra-rounded',
    size = 1024,
  } = {},
) {
  const { default: QRCodeStyling } = await import('qr-code-styling');
  const type = format === 'svg' ? 'svg' : 'png';
  const qr = new QRCodeStyling(
    justGoQrOptions(url, {
      size,
      type,
      fgColor,
      bgColor,
      transparentBg,
      dotType,
      cornerType,
    }),
  );
  const blob = await qr.getRawData(type);
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename || justGoQrFilename('qr', type);
  link.click();
  URL.revokeObjectURL(href);
}
