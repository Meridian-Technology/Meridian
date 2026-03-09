import React, { useRef, useEffect, useState, useCallback } from 'react';
import './AuthPagePreview.scss';
import loginMockup from '../../assets/Mockups/LoginMobile.png';
import backgroundImage from '../../assets/LandingBackground.png';

function StyledQRCode({ url, size = 120, fgColor = '#414141', bgColor = '#ffffff', className = '' }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!url || !containerRef.current) return;

    const loadQR = async () => {
      const { default: QRCodeStyling } = await import('qr-code-styling');
      const qr = new QRCodeStyling({
        width: size,
        height: size,
        type: 'svg',
        data: url,
        dotsOptions: { color: fgColor, type: 'extra-rounded' },
        backgroundOptions: { color: bgColor },
        cornersSquareOptions: { type: 'extra-rounded', color: fgColor },
        cornersDotOptions: { type: 'extra-rounded', color: fgColor },
      });
      containerRef.current.innerHTML = '';
      qr.append(containerRef.current);
    };
    loadQR();
    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [url, size, fgColor, bgColor]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

function AuthPagePreview() {
  const mobileUrl = typeof window !== 'undefined' ? `${window.location.origin}/mobile` : 'https://meridian.app/mobile';
  const containerRef = useRef(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = (e.clientX - centerX) / rect.width;
    const y = (e.clientY - centerY) / rect.height;
    const factor = 18;
    setParallax({ x: x * factor, y: y * factor });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setParallax({ x: 0, y: 0 });
  }, []);

  return (
    <div
      ref={containerRef}
      className="auth-page-preview block"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="auth-page-preview__hero-bg" style={{ backgroundImage: `url(${backgroundImage})` }} aria-hidden />
      <div className="auth-page-preview__promo">
        <span className="auth-page-preview__eyebrow">Download the app</span>
        <h3 className="auth-page-preview__title">Meridian Go</h3>
        <p className="auth-page-preview__blurb">Discover events, explore spaces, and connect on campus.</p>
        <div className="auth-page-preview__qr-wrap">
          <StyledQRCode
            url={mobileUrl}
            size={152}
            fgColor="#ffffff"
            bgColor="transparent"
            className="auth-page-preview__qr"
          />
          <span className="auth-page-preview__hint">Scan to download</span>
        </div>
      </div>
      <div className="auth-page-preview__mockup">
        <img
          src={loginMockup}
          alt="Meridian app on mobile"
          className="auth-page-preview__mockup-img"
          style={{
            transform: `translate(${parallax.x - 18}px, ${parallax.y + 18}px)`,
            transition: parallax.x === 0 && parallax.y === 0 ? 'transform 0.4s ease-out' : 'none',
          }}
        />
      </div>
    </div>
  );
}

export default AuthPagePreview;
