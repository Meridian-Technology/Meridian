import React from 'react';
import { Link } from 'react-router-dom';
import { isJustGoHost } from '../../config/tenantRedirect';
import { justGoLegalPath } from './justGoLandingUtils';
import { JustGoLegalLayout, JustGoLegalSection } from './JustGoLegalLayout';

function JustGoPrivacyPolicy() {
  const justGoHost = isJustGoHost();
  const termsTo = justGoLegalPath('terms', justGoHost);

  return (
    <JustGoLegalLayout
      documentTitle="privacy · just go"
      kicker="how we handle your data"
      title="privacy"
    >
      <JustGoLegalSection title="who this covers">
        <p>
          this policy is for <strong>just go</strong> — the just go app
          (ios and android, bundle id app.justgo) and the just go
          website at justgo.lol, including city waitlists. just go is operated
          by meridian. it is a separate product from meridian go, the campus
          app.
        </p>
        <p>
          if you do not agree with this policy, do not create an account or
          join a waitlist. using just go means you agree to this policy and
          our <Link to={termsTo}>terms</Link>.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="what we collect">
        <h3>you give us</h3>
        <ul>
          <li>
            <strong>account:</strong> name, email, and password if you register
            with email. sign in with apple or google may send us your name,
            email (or apple’s private relay email), and a stable account id.
          </li>
          <li>
            <strong>age:</strong> birth year, so we can keep just go 18+.
          </li>
          <li>
            <strong>city:</strong> the just go city you pick, plus optional
            invite / referral codes.
          </li>
          <li>
            <strong>profile:</strong> display name, interest tags, and
            appearance settings you choose. just go does not currently collect
            a profile photo or bio.
          </li>
          <li>
            <strong>friends and circles:</strong> friend requests, circle names,
            membership, and invites you send or accept.
          </li>
          <li>
            <strong>waitlist:</strong> if you join a city waitlist on the site,
            the email and city you submit.
          </li>
        </ul>

        <h3>device permissions (optional)</h3>
        <p>
          these are off until you allow them. you can skip them in onboarding
          and still use just go.
        </p>
        <ul>
          <li>
            <strong>contacts:</strong> if you tap scan contacts, we read emails
            and phone numbers on your device, hash them on the device, and send
            only those hashes to our servers to see who is already on just go.
            we do not store your address book, and we do not message your
            contacts for you.
          </li>
          <li>
            <strong>calendar:</strong> if you allow calendar access, just go can
            add nights you save to a calendar on your device. we do not upload
            your calendar events to our servers.
          </li>
          <li>
            <strong>notifications:</strong> a push token so we can send drop
            and plan alerts. you can turn this off in ios / android settings.
          </li>
        </ul>

        <h3>we collect automatically</h3>
        <ul>
          <li>
            <strong>app and site use:</strong> screens you open, swipes, saves,
            ticket-link taps, and similar product events. this is first-party
            analytics on our servers — we do not use apple’s tracking (idfa)
            to follow you across other companies’ apps.
          </li>
          <li>
            <strong>device:</strong> app version, os, device type, language,
            timezone, and crash / diagnostic logs.
          </li>
          <li>
            <strong>logs:</strong> ip address, time, and basic request metadata
            when you talk to our api or load justgo.lol.
          </li>
          <li>
            <strong>cookies:</strong> on the website only, to keep the page
            working and remember a city you picked.
          </li>
        </ul>

        <h3>what we do not collect in just go</h3>
        <p>
          just go does not use the camera, does not scan qr codes, and does
          not collect school affiliation or study-room location. we do not
          currently collect precise gps location in just go. if that changes,
          we will ask permission and update this policy first.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="how we use it">
        <ul>
          <li>run your account, city, drop, explore, friends, and circles</li>
          <li>personalize the week’s drop from your swipes, interests, friends, and history</li>
          <li>match hashed contacts to people already on just go, only if you ask</li>
          <li>add saved nights to your on-device calendar, only if you allow it</li>
          <li>send transactional mail and, if you opt in, push notifications</li>
          <li>email waitlist signups when that city launches</li>
          <li>keep the product stable, debug issues, and prevent abuse</li>
          <li>comply with law and our terms</li>
        </ul>
        <p>
          we do not sell your personal information. we do not use your
          contacts or calendar to advertise to other people.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="when we share it">
        <ul>
          <li>
            <strong>other just go users:</strong> your display name, city, and
            the plan signals you choose to show (for example that you are
            going) can be visible to friends and circle members.
          </li>
          <li>
            <strong>ticket sites:</strong> if you tap get tickets, you leave
            just go for that provider (partiful, luma, eventbrite, a venue
            site, and so on). what you do there is under their privacy policy.
            we may log that you opened the link.
          </li>
          <li>
            <strong>sign-in providers:</strong> apple and google, if you use
            them. their policies apply to the sign-in flow.
          </li>
          <li>
            <strong>vendors:</strong> hosting, email delivery, push delivery,
            and similar processors who only handle data to run just go for us.
          </li>
          <li>
            <strong>legal:</strong> if required by law, or to protect people
            from harm, fraud, or a terms violation.
          </li>
          <li>
            <strong>business transfer:</strong> if just go or meridian is
            acquired, this data may transfer with it under this policy.
          </li>
        </ul>
      </JustGoLegalSection>

      <JustGoLegalSection title="how long we keep it">
        <p>
          we keep account data while your account exists. when you delete your
          account in the app (you → account settings → delete account), we
          delete or anonymize personal data tied to that account, except what
          we must keep for legal, security, or dispute reasons.
        </p>
        <p>
          waitlist emails stay until a platform admin removes that signup.
          there is no self-serve delete on the landing page yet. email us if
          you need an address taken off a city list.
        </p>
        <p>
          hashes from a contacts scan are used to return matches. we do not
          keep your raw address book. cached app data on your phone goes away
          when you delete the app.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="your choices">
        <ul>
          <li>
            <strong>skip permissions:</strong> calendar, contacts, and
            notifications are optional.
          </li>
          <li>
            <strong>device settings:</strong> revoke calendar, contacts, or
            notifications anytime in ios or android settings.
          </li>
          <li>
            <strong>delete account:</strong> in the just go app, open you →
            account settings → delete account. that is permanent.
          </li>
          <li>
            <strong>waitlist:</strong> email privacy@meridian.study or
            raven@meridian.study to remove a waitlist email.
          </li>
          <li>
            <strong>access / correction:</strong> you can edit name and
            interests in the app. email us to request a copy of the personal
            data we hold, or to correct something you cannot edit.
          </li>
        </ul>
      </JustGoLegalSection>

      <JustGoLegalSection title="children">
        <p>
          just go is for people 18 and older. we do not knowingly collect
          personal information from anyone under 18. the app asks for birth
          year during onboarding and will not let an under-18 year through.
          the website waitlist does not currently verify age — do not submit a
          child’s email. if you believe we have information about a minor,
          contact us and we will delete it.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="security">
        <p>
          we use standard technical and organizational measures to protect
          accounts and hashes. no internet service is perfectly secure. if we
          learn of a breach that affects you, we will notify you as required
          by law.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="changes">
        <p>
          we may update this policy. the date at the top will change. material
          changes will be posted here. keep using just go after a change and
          you accept the new policy.
        </p>
      </JustGoLegalSection>

      <JustGoLegalSection title="contact">
        <p>
          questions about privacy, deletion, or this policy:
        </p>
        <div className="justgo-legal__contact">
          <p>
            <strong>privacy:</strong>{' '}
            <a href="mailto:privacy@meridian.study">privacy@meridian.study</a>
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

export default JustGoPrivacyPolicy;
