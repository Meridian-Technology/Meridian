import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import './Popup.scss';
import useOutsideClick from '../../hooks/useClickOutside';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

const CLOSE_MS = 300;

const Popup = ({
  children,
  isOpen,
  onClose,
  newStyling = false,
  defaultStyling = true,
  customClassName = '',
  overlayClassName = '',
  popout = false,
  hideCloseButton = false,
  disableOutsideClick = false,
}) => {
  const [mounted, setMounted] = useState(isOpen);
  const [visible, setVisible] = useState(false);
  const isClosingRef = useRef(false);
  const closeTimerRef = useRef(null);

  const [topPosition, setTopPosition] = useState(null);
  const [rightPosition, setRightPosition] = useState(null);
  const ref = useRef();

  const handleClose = useCallback(() => {
    if (!isOpen || isClosingRef.current) return;
    onClose?.();
  }, [isOpen, onClose]);

  useOutsideClick(
    ref,
    () => {
      if (!disableOutsideClick) handleClose();
    }
  );

  useEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (isOpen) {
      isClosingRef.current = false;
      setMounted(true);
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }

    if (!mounted) return undefined;

    setVisible(false);
    isClosingRef.current = true;
    closeTimerRef.current = setTimeout(() => {
      setMounted(false);
      isClosingRef.current = false;
      closeTimerRef.current = null;
    }, CLOSE_MS);

    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [isOpen, mounted]);

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        setTopPosition(rect.top);
        setRightPosition(rect.right);
      }
    }, CLOSE_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!mounted) {
    return null;
  }

  const renderChildrenWithClose = () => {
    if (React.isValidElement(children)) {
      return React.cloneElement(children, { handleClose });
    }
    return children;
  };

  return ReactDOM.createPortal(
    <div className={`popup-overlay ${overlayClassName} ${visible ? 'fade-in' : 'fade-out'}`}>
      {popout && !hideCloseButton ? (
        <Icon
          icon="ep:close-bold"
          onClick={handleClose}
          className="close-popup popout"
          style={{ left: rightPosition + 10, top: topPosition }}
        />
      ) : null}

      <div
        className={`${newStyling ? 'popup-content-new' : 'popup-content'} ${visible ? 'slide-in' : 'slide-out'} ${defaultStyling ? '' : 'no-styling'} ${customClassName}`}
        ref={ref}
      >
        {newStyling ? (
          <div className="popup-content-inner">
            {!popout && !hideCloseButton ? (
              <Icon icon="ep:close-bold" onClick={handleClose} className="close-popup" />
            ) : null}
            {renderChildrenWithClose()}
          </div>
        ) : (
          <>
            {!popout && !hideCloseButton ? (
              <Icon icon="ep:close-bold" onClick={handleClose} className="close-popup" />
            ) : null}
            {renderChildrenWithClose()}
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default Popup;
