import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import justGoWordmark from '../../assets/pivot/just-go-wordmark-dark.svg';
import { isJustGoHost } from '../../config/tenantRedirect';
import './JustGoLegalLayout.scss';

export const JUSTGO_LEGAL_UPDATED = 'August 20, 2026';

export function JustGoLegalLayout({
  documentTitle,
  kicker = 'just go',
  title,
  children,
}) {
  const homeTo = isJustGoHost() ? '/' : '/justgo';

  useEffect(() => {
    const previous = document.title;
    document.title = documentTitle;
    return () => {
      document.title = previous;
    };
  }, [documentTitle]);

  return (
    <div className="justgo-legal">
      <p className="justgo-legal__proof">just go · this week in your city</p>
      <nav className="justgo-legal__nav" aria-label="just go">
        <Link to={homeTo}>
          <img
            className="justgo-legal__wordmark"
            src={justGoWordmark}
            alt="just go"
            draggable={false}
          />
        </Link>
        <Link className="justgo-legal__back" to={homeTo}>
          back to just go
        </Link>
      </nav>
      <article className="justgo-legal__article">
        <p className="justgo-legal__kicker">{kicker}</p>
        <h1 className="justgo-legal__title">{title}</h1>
        <p className="justgo-legal__updated">last updated {JUSTGO_LEGAL_UPDATED}</p>
        {children}
      </article>
    </div>
  );
}

export function JustGoLegalSection({ title, children }) {
  return (
    <section className="justgo-legal__section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
