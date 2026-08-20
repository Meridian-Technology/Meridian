import React from 'react';
import { Link } from 'react-router-dom';
import { isJustGoHost } from '../../config/tenantRedirect';
import { justGoLegalPath } from './justGoLandingUtils';
import { JustGoLegalLayout, JustGoLegalSection } from './JustGoLegalLayout';

function JustGoTermsOfService() {
  const justGoHost = isJustGoHost();
  const privacyTo = justGoLegalPath('privacy', justGoHost);

  return (
    <JustGoLegalLayout
      documentTitle="terms · just go"
      kicker="the rules of the room"
      title="terms"
    >
      <JustGoLegalSection title="1. agreement">
        <p>
          these terms govern <strong>just go</strong> — the just go app and
          justgo.lol, including city waitlists. just go is operated by
          meridian. it is not meridian go (the campus product).
        </p>
        <p>
          by creating an account, joining a waitlist, or using just go, you
          agree to these terms and the{' '}
          <Link to={privacyTo}>privacy policy</Link>. if you do not agree,
          do not use just go.
        </p>
        <p>
          we may update these terms. the date at the top will change. keep
          using just go after a change and you accept the new terms. if you
          do not, delete your account and stop using the app and site.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="2. what just go is">
        <p>
          just go helps people 18+ find what’s on in their city this week: a
          personal drop to swipe, explore, friends and circles, and links out
          to tickets or rsvps. cities launch over time. a waitlist spot is not
          a promise that a city will open, or that you will get in first.
        </p>
        <p>
          just go is not the venue, promoter, or ticket seller for nights in
          the drop. listings may come from organizers, public pages, or
          partners, and can be wrong, moved, or cancelled. always confirm
          details with the host before you go.
        </p>
        <p>
          tapping get tickets opens a third-party site (for example partiful,
          luma, or a venue page). their terms, refunds, and age checks apply.
          just go does not process those payments.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="3. eligibility">
        <p>
          you must be at least 18 years old. the app asks for birth year and
          will not continue if that year is under 18. do not lie about your
          age. just go is not a school product and does not require a campus
          email.
        </p>
        <p>
          you are responsible for following local law where you use just go,
          including alcohol, venue, and ticketing rules. we do not encourage
          illegal or excessive drinking, and we are not responsible for what
          happens at a night you found here.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="4. accounts">
        <p>
          keep your login to yourself. you are responsible for activity on
          your account. tell us if someone else gets in.
        </p>
        <p>
          we may suspend or delete an account that breaks these terms, looks
          automated or fake, or puts other people at risk — with or without
          notice when we need to move fast.
        </p>
        <p>
          you can delete your account in the app: you → account settings →
          delete account. that cannot be undone. waitlist emails are not
          accounts; email us to remove one.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="5. your content">
        <p>
          you own the names, circle names, and other text you submit. you
          grant meridian a worldwide, non-exclusive, royalty-free license to
          host and show that content in just go so the product can work (for
          example showing your name to a friend).
        </p>
        <p>do not post or send anything that:</p>
        <ul>
          <li>is illegal, hateful, harassing, sexual involving minors, or violent</li>
          <li>infringes someone else’s rights</li>
          <li>is spam, scams, or impersonation</li>
          <li>scrapes, overloads, or breaks just go</li>
        </ul>
        <p>
          we may remove content or accounts that violate this. to report
          abuse, email raven@meridian.study. we do not currently offer in-app
          report or block.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="6. listings and organizers">
        <p>
          if you submit a night (including through just go creator tools), you
          promise you have the right to share it, that it is accurate, and
          that it is appropriate for an 18+ audience. you are the one
          responsible for the event, door policy, and any tickets you sell
          off-app.
        </p>
        <p>
          we may edit, unpublish, or refuse listings that are unsafe, illegal,
          misleading, or off-brand. appearing in the drop is not a paid
          placement unless we say so in writing.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="7. permissions">
        <p>
          contacts and calendar are optional. if you scan contacts, you agree
          we may hash emails and phone numbers on your device to find people
          already on just go. we will not blast your address book. if you
          allow calendar, just go may write events you save onto your device
          calendar.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="8. our ip">
        <p>
          the just go name, wordmark, drop, and app are ours (and meridian’s).
          do not copy the product, scrape the drop at scale, or use the marks
          in a way that says you are just go.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="9. disclaimers">
        <p>
          JUST GO IS PROVIDED “AS IS” AND “AS AVAILABLE.” WE DO NOT WARRANT
          THAT THE DROP IS COMPLETE, THAT A LISTING IS STILL ON, OR THAT THE
          APP WILL ALWAYS BE ERROR-FREE. TO THE MAXIMUM EXTENT ALLOWED BY LAW,
          WE DISCLAIM IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        </p>
        <p>
          apple, google, and ticket providers are not parties to these terms
          and are not responsible for just go.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="10. liability">
        <p>
          TO THE MAXIMUM EXTENT ALLOWED BY LAW, MERIDIAN AND ITS PEOPLE ARE
          NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
          PUNITIVE DAMAGES, OR FOR WHAT HAPPENS AT A THIRD-PARTY EVENT, OR FOR
          TICKET PURCHASES YOU MAKE OFF-APP.
        </p>
        <p>
          our total liability for claims about just go will not exceed the
          greater of $100 or the amount you paid us for just go in the twelve
          months before the claim (currently just go is free).
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="11. indemnity">
        <p>
          you will defend and indemnify meridian against claims that come from
          your use of just go, your content, your events, or your breach of
          these terms, including reasonable legal fees.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="12. law">
        <p>
          these terms are governed by the laws of the jurisdiction in which
          meridian operates, without regard to conflict-of-law rules, except
          where your local consumer law says otherwise and cannot be waived.
        </p>
        <p>
          if a piece of these terms cannot be enforced, the rest still applies.
          if we do not enforce a right once, we can still enforce it later.
          you may not assign your account; we may assign these terms.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="13. contact">
        <p>questions about these terms:</p>
        <div className="justgo-legal__contact">
          <p>
            <strong>legal:</strong>{' '}
            <a href="mailto:legal@meridian.study">legal@meridian.study</a>
          </p>
          <p>
            <strong>just go:</strong>{' '}
            <a href="mailto:raven@meridian.study">raven@meridian.study</a>
          </p>
          <p>
            <strong>site:</strong>{' '}
            <a href="https://justgo.lol" rel="noopener noreferrer">
              justgo.lol
            </a>
          </p>
        </div>
      </JustGoLegalSection>
    </JustGoLegalLayout>
  );
}

export default JustGoTermsOfService;
