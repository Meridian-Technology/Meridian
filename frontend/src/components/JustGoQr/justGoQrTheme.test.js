import {
  JUSTGO_QR_CAMPUS_GREEN,
  JUSTGO_QR_DEFAULT_BG,
  JUSTGO_QR_DEFAULT_FG,
  JUSTGO_QR_SWATCHES,
  justGoQrFilename,
  justGoQrOptions,
} from './justGoQrTheme';

describe('justGoQrTheme', () => {
  it('defaults to Just Go ink and cream, not campus green', () => {
    const swatchValues = JUSTGO_QR_SWATCHES.map((swatch) => swatch.value.toLowerCase());
    expect(JUSTGO_QR_DEFAULT_FG).toBe('#1A1714');
    expect(JUSTGO_QR_DEFAULT_BG).toBe('#FAF6EF');
    expect(swatchValues).not.toContain(JUSTGO_QR_CAMPUS_GREEN.toLowerCase());
    expect(swatchValues).toContain('#1a1714');
  });

  it('builds transparent preview options with Just Go ink', () => {
    const options = justGoQrOptions('https://justgo.lol/qr/poster-night');
    expect(options.data).toBe('https://justgo.lol/qr/poster-night');
    expect(options.dotsOptions.color).toBe('#1A1714');
    expect(options.backgroundOptions.color).toBe('transparent');
  });

  it('names downloads with the QR slug', () => {
    expect(justGoQrFilename('poster-night', 'svg')).toBe('justgo-qr-poster-night.svg');
  });
});
