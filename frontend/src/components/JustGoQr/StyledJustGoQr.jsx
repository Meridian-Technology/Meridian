import React, { useEffect, useRef } from 'react';
import {
  JUSTGO_QR_DEFAULT_BG,
  JUSTGO_QR_DEFAULT_FG,
  justGoQrOptions,
} from './justGoQrTheme';
import './JustGoQr.scss';

function StyledJustGoQr({
  url,
  fgColor = JUSTGO_QR_DEFAULT_FG,
  bgColor = JUSTGO_QR_DEFAULT_BG,
  transparentBg = true,
  dotType = 'extra-rounded',
  cornerType = 'extra-rounded',
  size = 240,
  className = '',
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!url || !node) return undefined;
    let cancelled = false;
    (async () => {
      const { default: QRCodeStyling } = await import('qr-code-styling');
      if (cancelled || !node) return;
      const qr = new QRCodeStyling(
        justGoQrOptions(url, {
          size,
          type: 'svg',
          fgColor,
          bgColor,
          transparentBg,
          dotType,
          cornerType,
        }),
      );
      node.innerHTML = '';
      qr.append(node);
    })();
    return () => {
      cancelled = true;
      node.innerHTML = '';
    };
  }, [url, fgColor, bgColor, transparentBg, dotType, cornerType, size]);

  return (
    <div
      ref={containerRef}
      className={`justgo-qr-canvas${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      data-testid="justgo-qr-canvas"
    />
  );
}

export default StyledJustGoQr;
