import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./MobileLanding.scss";
import Header from "../../components/Header/Header";
import Popup from "../../components/Popup/Popup";
import backgroundImage from "../../assets/LandingBackground.png";
import { Icon } from "@iconify-icon/react/dist/iconify.mjs";
import { analytics } from "../../services/analytics/analytics";
import heroImage from "../../assets/Mockups/LandingMockup1.png";
import mobileLogo from "../../assets/Brand Image/MeridianGO.png";
import logo from "../../assets/Brand Image/BEACON.svg";
import RpiLogo from "../../assets/Brand Image/RpiLogo.svg";
import BerkeleyLogo from "../../assets/Brand Image/BerkeleyLogo.svg";

function getLogo() {
  if (typeof window === "undefined") return logo;
  const hostname = window.location.hostname;
  const parts = hostname.split(".");
  if (parts.length > 2) {
    let subdomain = parts[0];
    if (subdomain.toLowerCase() === "www") subdomain = parts[1];
    if (subdomain.toLowerCase() === "rpi") return RpiLogo;
    if (subdomain.toLowerCase() === "berkeley") return BerkeleyLogo;
  }
  return logo;
}

// Store URLs - update APP_STORE_URL when published
const APP_STORE_URL = "https://apps.apple.com/us/app/meridian-go/id6755217537";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.meridian.mobile";

function useDeviceDetection() {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return { isMobile: false, isIOS: false, isAndroid: false };
    }
    const ua = navigator.userAgent || navigator.vendor || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /android/i.test(ua);
    const isMobile = isIOS || isAndroid || /Mobi|Android/i.test(ua);
    return { isMobile, isIOS, isAndroid };
  }, []);
}

function StyledQRCode({ url, size = 200, fgColor = "#414141", bgColor = "#ffffff" }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!url || !containerRef.current) return;

    const loadQR = async () => {
      const { default: QRCodeStyling } = await import("qr-code-styling");
      const qr = new QRCodeStyling({
        width: size,
        height: size,
        type: "svg",
        data: url,
        dotsOptions: { color: fgColor, type: "extra-rounded" },
        backgroundOptions: { color: bgColor },
        cornersSquareOptions: { type: "extra-rounded", color: fgColor },
        cornersDotOptions: { type: "extra-rounded", color: fgColor },
      });
      containerRef.current.innerHTML = "";
      qr.append(containerRef.current);
    };
    loadQR();
    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [url, size, fgColor, bgColor]);

  return (
    <div
      ref={containerRef}
      className="mobile-landing__qr"
      style={{ width: size, height: size }}
    />
  );
}

function AndroidTesterSignupPopup({ isOpen, onClose, playStoreUrl }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("submitting");
    setMessage("");
    try {
      const res = await axios.post(
        "/api/android-tester/signup",
        { email: email.trim(), source: "mobile_landing" },
        { withCredentials: true }
      );
      setStatus("success");
      setMessage(res.data.message || "You're on the list!");
    } catch (err) {
      setStatus("error");
      setMessage(err.response?.data?.message || "Something went wrong. Please try again.");
    }
  };

  const handleClose = () => {
    setEmail("");
    setStatus("idle");
    setMessage("");
    onClose();
  };

  return (
    <Popup
      isOpen={isOpen}
      onClose={handleClose}
      customClassName="mobile-landing__android-signup-popup"
    >
      <div className="mobile-landing__android-signup">
        <h3>Join the Android beta</h3>
        <p className="mobile-landing__android-signup-desc">
          Meridian for Android is in closed testing. Enter your email to be added to the testing list.
        </p>
        {status === "success" ? (
          <div className="mobile-landing__android-signup-success-wrap">
            <p className="mobile-landing__android-signup-success">{message}</p>
            <p className="mobile-landing__android-signup-hint">
              We&apos;ll add you to the testing track and you&apos;ll receive an invite from Google Play.
            </p>
            <div className="mobile-landing__android-signup-buttons">
              <a
                href={playStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--primary"
              >
                Open Play Store
              </a>
              <button type="button" className="btn btn--secondary" onClick={handleClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              disabled={status === "submitting"}
              className="mobile-landing__android-signup-input"
            />
            {message && (
              <p className={`mobile-landing__android-signup-msg ${status === "error" ? "mobile-landing__android-signup-msg--error" : ""}`}>
                {message}
              </p>
            )}
            <button
              type="submit"
              className="btn btn--primary"
              disabled={status === "submitting"}
            >
              {status === "submitting" ? "Joining..." : "Join testing list"}
            </button>
            <button type="button" className="btn btn--secondary" onClick={handleClose}>
              Cancel
            </button>
          </form>
        )}
      </div>
    </Popup>
  );
}

const FEATURES = [
  {
    key: "explore",
    icon: "mdi:compass-outline",
    title: "Explore",
    description:
      "Discover events, rooms, and organizations from one place. Filter by interests and find what's happening on campus.",
  },
  {
    key: "my_events",
    icon: "mdi:calendar-check",
    title: "My Events",
    description:
      "Track RSVPs and events you're attending. Get reminders and manage your schedule on the go.",
  },
  {
    key: "resources",
    icon: "mdi:book-open-page-variant",
    title: "Resources",
    description:
      "Access campus resources and guides. Everything you need in one app.",
  },
  {
    key: "organizations",
    icon: "mdi:account-group",
    title: "Organizations",
    description:
      "Browse and join clubs. Stay connected with the communities that matter to you.",
  },
  {
    key: "shuttle_tracker",
    icon: "mdi:bus-multiple",
    title: "Shuttle Tracker",
    description:
      "Real-time shuttle tracking on campus. See where buses are and when they'll arrive.",
  },
  {
    key: "qr_scanner",
    icon: "mdi:qrcode-scan",
    title: "QR Scanner",
    description:
      "Check in to events and rooms with a quick scan. No more manual sign-in.",
  },
];

function MobileLanding() {
  const navigate = useNavigate();
  const { isMobile, isIOS, isAndroid } = useDeviceDetection();
  const [showQR, setShowQR] = useState(false);
  const [showAndroidSignup, setShowAndroidSignup] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Analytics: screen view on mount
  useEffect(() => {
    analytics.screen("Mobile Landing");
  }, []);

  // Scroll detection for header visibility on mobile
  useEffect(() => {
    const scrollHandler = () => {
      const container = document.querySelector('.landing-container');
      const scrollPosition = container ? container.scrollTop : 0;
      setScrolled(prev => (prev ? scrollPosition > 30 : scrollPosition > 50));
    };
    const container = document.querySelector('.landing-container');
    if (container) container.addEventListener('scroll', scrollHandler, { passive: true });
    scrollHandler();
    return () => {
      const c = document.querySelector('.landing-container');
      if (c) c.removeEventListener('scroll', scrollHandler);
    };
  }, []);

  const handleAppStoreClick = (source = "cta_section") => {
    analytics.track("mobile_landing_app_store_click", { source });
    window.open(APP_STORE_URL, "_blank");
  };

  const handlePlayStoreClick = (source = "cta_section") => {
    analytics.track("mobile_landing_play_store_click", { source });
    setShowAndroidSignup(true);
  };

  const handleQRExpand = () => {
    analytics.track("mobile_landing_qr_expanded");
    setShowQR(true);
  };

  const handleFeatureClick = (feature) => {
    analytics.track("mobile_landing_feature_click", { feature });
  };

  const qrTargetUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/mobile`
      : "https://meridian.app/mobile";

  return (
    <div className="landing-container">
      <div className="landing mobile-landing">
        <Header
          hideUntilScroll
          scrolled={scrolled}
          appStoreButton={isMobile ? (isIOS ? 'ios' : isAndroid ? 'android' : null) : null}
          onAppStoreClick={handleAppStoreClick}
          onPlayStoreClick={handlePlayStoreClick}
        />

        {/* Top logo when header is hidden on mobile */}
        <div className={`mobile-landing__top-logo ${!scrolled ? 'mobile-landing__top-logo--visible' : ''}`}>
          <img src={mobileLogo} alt="Meridian Go" />
        </div>

        {/* Hero */}
        <section
          className="hero mobile-landing__hero"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        >
          <div className="hero__container">
            <div className="hero__content">
              <h1 className="hero__title">
                <span className="hero__title-line hero__title-line--1 hero__title-logo">
                  <img src={getLogo()} alt="Meridian" />
                </span>
                <br />
                <span className="hero__title-line hero__title-line--2">
                  in your pocket
                </span>
              </h1>
              <p className="hero__subtitle hero__subtitle--animated">
                Events, rooms, organizations, and shuttle tracking — campus life
                unified in one app.
              </p>
              <div className="hero__cta mobile-landing__hero-cta">
                {isMobile ? (
                  <>
                    {isIOS && (
                      <button
                        className="mobile-landing__store-badge"
                        onClick={() => handleAppStoreClick("hero")}
                        aria-label="Download on the App Store"
                      >
                        <img
                          src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
                          alt="Download on the App Store"
                          height="40"
                        />
                      </button>
                    )}
                    {isAndroid && (
                      <button
                        className="mobile-landing__store-badge"
                        onClick={() => handlePlayStoreClick("hero")}
                        aria-label="Get it on Google Play"
                      >
                        <img
                          src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                          alt="Get it on Google Play"
                          height="60"
                        />
                      </button>
                    )}
                    {!isIOS && !isAndroid && (
                      <div className="mobile-landing__store-badges">
                        <button
                          className="mobile-landing__store-badge"
                          onClick={() => handleAppStoreClick("hero")}
                          aria-label="Download on the App Store"
                        >
                          <img
                            src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
                            alt="Download on the App Store"
                            height="40"
                          />
                        </button>
                        <button
                          className="mobile-landing__store-badge"
                          onClick={() => handlePlayStoreClick("hero")}
                          aria-label="Get it on Google Play"
                        >
                          <img
                            src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                            alt="Get it on Google Play"
                            height="60"
                          />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn--primary"
                      onClick={handleQRExpand}
                    >
                      Show QR code
                    </button>
                    <button
                      className="btn btn--secondary"
                      onClick={() => navigate("/events-dashboard")}
                    >
                      Go to web app
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="hero__visual mobile-landing__mockup-wrapper">
              <div
                className="mobile-landing__mockup mobile-landing__mockup--hero"
                aria-label="Mobile app mockup"
              >
                <img src={heroImage} alt="Meridian mobile app" />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mobile-landing__features">
          <div className="mobile-landing__features-content">
            <div className="mobile-landing__features-head">
              <h2>Everything campus, one app</h2>
              <p>
                From discovering events to tracking shuttles — Meridian brings
                student life to your phone.
              </p>
            </div>
            <div className="mobile-landing__features-grid">
              {FEATURES.map((feature) => (
                <div
                  key={feature.key}
                  className="mobile-landing__feature"
                  onClick={() => handleFeatureClick(feature.key)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleFeatureClick(feature.key)
                  }
                  role="button"
                  tabIndex={0}
                >
                  <div className="mobile-landing__feature-icon">
                    <Icon icon={feature.icon} />
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Install CTA */}
        <section className="mobile-landing__install"
        style={{ backgroundImage: `url(${backgroundImage})` }}
        >
          <div className="mobile-landing__install-content">
            <h2>Download Meridian Go</h2>
            <p>
              {isMobile
                ? "Get the app and take campus with you."
                : "Scan the QR code with your phone to download."}
            </p>

            {!isMobile && (
              <div className="mobile-landing__qr-section">
                <button
                  className="btn btn--primary"
                  onClick={handleQRExpand}
                >
                  Show QR code
                </button>
              </div>
            )}

            <div className="mobile-landing__store-badges-row">
              <button
                className="mobile-landing__store-badge-btn"
                onClick={() =>
                  handleAppStoreClick(isMobile ? "cta_section" : "cta_section")
                }
                aria-label="Download on the App Store"
              >
                <img
                  src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
                  alt="Download on the App Store"
                  height="40"
                />
              </button>
              <button
                className="mobile-landing__store-badge-btn"
                onClick={() =>
                  handlePlayStoreClick(isMobile ? "cta_section" : "cta_section")
                }
                aria-label="Get it on Google Play"
              >
                <img
                  src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                  alt="Get it on Google Play"
                  height="60"
                />
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="footer">
          <div className="footer__grid">
            <div className="footer__col">
              <h5>Meridian</h5>
              <p>Building connected campuses.</p>
            </div>
            <div className="footer__col">
              <h6>Product</h6>
              <a href="/contact">Demo</a>
              <a href="/documentation">Docs</a>
              <a href="/mobile">Mobile app</a>
            </div>
            <div className="footer__col">
              <h6>Company</h6>
              <a href="/login">Sign in</a>
              <a href="/register">Create account</a>
            </div>
            <div className="footer__col">
              <h6>Legal</h6>
              <a href="/privacy-policy">Privacy Policy</a>
              <a href="/contact">Contact</a>
            </div>
          </div>
          <div className="footer__legal">
            © {new Date().getFullYear()} Meridian
          </div>
        </footer>

        <Popup
          isOpen={showQR}
          onClose={() => setShowQR(false)}
          customClassName="mobile-landing__qr-popup"
        >
          <div className="mobile-landing__qr-container">
            <h3>Scan to download</h3>
            <StyledQRCode
              url={qrTargetUrl}
              size={220}
              fgColor="#414141"
              bgColor="#ffffff"
            />
            <p className="mobile-landing__qr-hint">
              Scan with your phone camera to open the app store
            </p>
          </div>
        </Popup>

        <AndroidTesterSignupPopup
          isOpen={showAndroidSignup}
          onClose={() => setShowAndroidSignup(false)}
          playStoreUrl={PLAY_STORE_URL}
        />
      </div>
    </div>
  );
}

export default MobileLanding;
