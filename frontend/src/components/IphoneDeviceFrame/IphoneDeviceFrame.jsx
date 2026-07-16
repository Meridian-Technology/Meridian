import React from 'react';
import { Squircle } from '@squircle-js/react';
import './IphoneDeviceFrame.scss';

const DEFAULT_WIDTH = 390;

/**
 * Reusable iPhone mockup with Dynamic Island, squircle corners, and home indicator.
 * Scales via `--iphone-frame-width` (default 390px — iPhone 15 Pro logical width).
 */
function IphoneDeviceFrame({
  children,
  className = '',
  screenClassName = '',
  label,
  hint,
  ariaLabel = 'iPhone preview',
  width = DEFAULT_WIDTH,
  maxScreenHeight,
  showHomeIndicator = true,
  showDynamicIsland = true,
  showSideButtons = true,
  showStatusBar = true,
  statusBarTheme = 'light',
}) {
  const bezelTotal = 'calc(var(--iphone-bezel) * 2)';
  const fullHeight = `calc((var(--iphone-frame-width) - ${bezelTotal}) * (852 / 393))`;
  const frameStyle = {
    '--iphone-frame-width': `${width}px`,
    '--iphone-screen-height': maxScreenHeight
      ? `min(${fullHeight}, ${maxScreenHeight})`
      : fullHeight,
  };

  return (
    <div
      className={`iphone-device-frame${className ? ` ${className}` : ''}`}
      style={frameStyle}
    >
      {label || hint ? (
        <div className="iphone-device-frame__caption">
          {label ? <p className="iphone-device-frame__label">{label}</p> : null}
          {hint ? <p className="iphone-device-frame__hint">{hint}</p> : null}
        </div>
      ) : null}

      <div className="iphone-device-frame__stage" aria-label={ariaLabel}>
        {showSideButtons ? (
          <>
            <span className="iphone-device-frame__button iphone-device-frame__button--silent" aria-hidden="true" />
            <span className="iphone-device-frame__button iphone-device-frame__button--volume-up" aria-hidden="true" />
            <span className="iphone-device-frame__button iphone-device-frame__button--volume-down" aria-hidden="true" />
            <span className="iphone-device-frame__button iphone-device-frame__button--power" aria-hidden="true" />
          </>
        ) : null}

        <Squircle
          cornerRadius={56}
          cornerSmoothing={1}
          className="iphone-device-frame__chassis"
        >
          <Squircle cornerRadius={48} cornerSmoothing={1} className="iphone-device-frame__screen-shell">
            <div
              className={`iphone-device-frame__screen iphone-device-frame__screen--${statusBarTheme}${
                screenClassName ? ` ${screenClassName}` : ''
              }`}
            >
              {showStatusBar ? (
                <div className="iphone-device-frame__status-bar" aria-hidden="true">
                  <span className="iphone-device-frame__status-time">9:41</span>
                  <span className="iphone-device-frame__status-icons">
                    <span className="iphone-device-frame__status-signal" />
                    <span className="iphone-device-frame__status-wifi" />
                    <span className="iphone-device-frame__status-battery" />
                  </span>
                </div>
              ) : null}

              {showDynamicIsland ? (
                <div className="iphone-device-frame__island" aria-hidden="true">
                  <span className="iphone-device-frame__island-lens" />
                </div>
              ) : null}

              <div className="iphone-device-frame__content">{children}</div>

              {showHomeIndicator ? (
                <div className="iphone-device-frame__home-indicator" aria-hidden="true" />
              ) : null}
            </div>
          </Squircle>
        </Squircle>

        <div className="iphone-device-frame__glare" aria-hidden="true" />
      </div>
    </div>
  );
}

export default IphoneDeviceFrame;
