/**
 * Creator-facing copy bank — Just Go voice only.
 * Avoid Atlas / Meridian / ClubDash / campus org language.
 *
 * Flare-register surfaces (gate, empty state, submit confirmation) speak in the consumer
 * scrapbook voice — lowercase, direct. Reskin surfaces (chrome, list rows, filters) stay
 * plain and legible.
 */

const justGoCreatorCopy = Object.freeze({
  productName: 'Just Go Creator',
  productShortName: 'Creator',
  wordmarkAlt: 'just go',

  shell: Object.freeze({
    eyebrow: 'creator',
    cityFallback: 'your city',
    signOut: 'Sign out',
    navHome: 'Your listings',
    navNew: 'New listing',
  }),

  home: Object.freeze({
    title: 'your listings',
    subtitle:
      'Everything you’ve sent us, and where it sits. Just Go reviews every listing before it goes into a drop.',
    loading: 'Loading your listings…',
    errorTitle: 'We couldn’t load your listings',
    errorBody: 'Something went wrong on our side. Try again in a moment.',
    errorRetry: 'Try again',
    /** Flare register — first-run empty state. */
    emptyTitle: 'nothing yet',
    emptyBody:
      'Your first listing goes to Just Go for review, lands in a drop week, and shows up in the app once we publish it.',
    emptyCta: 'Start a listing',
    /** Reskin register — filtered to a bucket with nothing in it. */
    filteredEmptyTitle: 'Nothing in this bucket',
    filteredEmptyBody: 'No listings match that filter yet.',
    filteredEmptyCta: 'Show all listings',
    interestedLabel: 'interested',
    weekLabel: 'drop week',
    weekUnassigned: 'No drop week yet',
    openListing: 'Open listing',
  }),

  filters: Object.freeze({
    label: 'Filter listings',
    all: 'All',
  }),

  /**
   * Flare register — the console's front door. Voice matches the mobile auth screen: lowercase,
   * second person, no campus vocabulary.
   */
  login: Object.freeze({
    ticker: 'post your event. fill the room. just go',
    heroTagline: 'what’s the city doing this week?',
    heroCaption: 'you decide.',
    title: 'creator sign in',
    titleWithCity: (city) => `sign in to ${city}`,
    subtitle: 'the console where you send events to the weekly drop.',
    emailLabel: 'email',
    emailPlaceholder: 'you@yourvenue.com',
    passwordLabel: 'password',
    passwordPlaceholder: 'your password',
    showPassword: 'show',
    hidePassword: 'hide',
    submit: 'sign in',
    submitBusy: 'signing you in…',
    or: 'or',
    continueGoogle: 'continue with google',
    forgotPassword: 'forgot your password?',
    inviteOnly: 'hosting is invite-only while we pilot. ask the just go team to add you.',
    backToMeridian: 'sign in to Meridian instead',
    errorInvalid: 'that email and password don’t match. try again.',
    errorGeneric: 'something went wrong signing you in. try again.',
    errorEmpty: 'enter your email and password.',
    /** Admin MFA is a Meridian-side flow; hand off rather than rebuild passkey / TOTP here. */
    mfaHandoff: 'your account needs another verification step — sending you to finish it.',
  }),

  /** Flare register — 403 from `requirePivotCreator`. */
  gate: Object.freeze({
    title: 'invite only',
    eyebrow: 'just go creator',
    forbiddenBody:
      'Hosting on Just Go is invite-only while we pilot with a handful of creators. Ask the Just Go team to add you and this page opens up.',
    forbiddenBodyWithCity: (city) =>
      `Hosting on Just Go is invite-only while we pilot with a handful of ${city} creators. Ask the Just Go team to add you and this page opens up.`,
    wrongTenantBody:
      'Just Go Creator lives on your city’s site. Open the Just Go link for your city and sign in there.',
    signedInAs: 'Signed in as',
  }),

  newListing: Object.freeze({
    title: 'new listing',
    subtitle:
      'Tell us what’s happening. We review every listing and slot it into a drop week — you don’t pick when it goes live.',
    backToList: 'Back to your listings',
  }),

  workspace: Object.freeze({
    title: 'your listing',
    backToList: 'Back to your listings',
    loading: 'Loading this listing…',
    notFoundTitle: 'We couldn’t find that listing',
    notFoundBody: 'It may have been removed, or it isn’t one of yours.',
    errorTitle: 'We couldn’t load this listing',
    errorBody: 'Something went wrong on our side. Try again in a moment.',
    errorRetry: 'Try again',

    navLabel: 'Listing workspace sections',
    railLabel: 'Listing phase',

    phases: Object.freeze({
      drafting: 'Drafting',
      planning: 'Planning',
      runOfShow: 'Run of Show',
      postMortem: 'Post Mortem',
    }),

    sections: Object.freeze({
      'drafting-core': 'Drafting',
      planning: 'Planning',
      live: 'Live',
      audience: 'Audience',
      insights: 'Insights',
      monitoring: 'Monitoring',
      retrospective: 'Retrospective',
      records: 'Records',
    }),

    tabs: Object.freeze({
      overview: 'Overview',
      details: 'Details',
      insights: 'Insights',
      interests: 'Interests',
      communications: 'Communications',
      promo: 'Promo QR',
    }),

    header: Object.freeze({
      refresh: 'Refresh',
      copyLink: 'Copy link',
      copied: 'Link copied',
      preview: 'Preview',
      updateListing: 'Update listing',
      interestedLabel: 'Interested',
      timeUntilLabel: 'Starts in',
      dropWeekLabel: 'Drop week',
      weekNone: 'No week yet',
      locationFallback: 'Location TBD',
    }),

    timeUntil: Object.freeze({
      started: 'Underway',
      minutes: (n) => `${n} min`,
      hours: (n) => `${n} hr`,
      days: (n) => `${n} ${n === 1 ? 'day' : 'days'}`,
    }),

    overview: Object.freeze({
      numbersTitle: 'How it’s doing',
      interested: 'Interested',
      gotTicket: 'Got a ticket',
      linkTaps: 'Ticket link taps',
      views: 'Page views',
      summaryTitle: 'Your listing',
      noDescription: 'No description yet.',
      hostLabel: 'Host',
      whenLabel: 'When',
      whereLabel: 'Where',
      tagsLabel: 'Tags',
      linkLabel: 'Ticket link',
      noTags: 'No tags yet',
      noLink: 'No ticket link',
    }),

    /** Flare register — the "what happens next" explainer, keyed to curation state. */
    explainer: Object.freeze({
      draftTitle: 'in the pile',
      draftBody:
        'Just Go ops review every listing before a drop. Nothing here is visible in the app yet.',
      stagedTitle: 'in curation',
      stagedBody:
        'You’re queued for a drop week. If it makes the cut it goes live when Just Go publishes.',
      publishedTitle: 'it’s live',
      publishedBody: 'People can find this in the app now.',
      dropWeek: (batchWeek) => `Target drop week: ${batchWeek}`,
      dropWeekUnknown: 'No drop week assigned yet.',
      parity:
        'App experience matches other Just Go listings until native tools ship.',
    }),

    interests: Object.freeze({
      title: 'Who’s in',
      subtitle: 'Aggregate only — Just Go doesn’t hand out attendee lists.',
      interested: 'Interested',
      gotTicket: 'Got a ticket',
      passed: 'Passed',
      linkTaps: 'Ticket link taps',
      linkTapUsers: 'People who tapped',
      emptyTitle: 'Nothing yet',
      emptyBody: 'Counts show up once your listing is live and people start swiping.',
      perPersonNote:
        'Per-person lists aren’t part of this phase. Ticketing and door tools come with native Just Go tooling.',
    }),

    promo: Object.freeze({
      title: 'Promo QR',
      subtitle: 'Point people straight at your listing page.',
      copyLink: 'Copy link',
      copied: 'Copied',
      download: 'Download PNG',
      downloadName: 'just-go-listing-qr.png',
      notLiveNote:
        'This link works now, but your listing won’t show up in the Just Go app until ops publish the drop.',
      liveNote: 'Your listing is live, so this link matches what people see in the app.',
      urlLabel: 'Listing link',
    }),

    insights: Object.freeze({
      title: 'How people found it',
      subtitle: 'The same numbers Just Go ops see for your listing.',

      funnelTitle: 'From scroll to ticket',
      funnelSteps: Object.freeze({
        views: 'Listing page views',
        interested: 'Interested',
        tapped: 'Tapped the ticket link',
        registered: 'Got a ticket',
      }),
      ofPrevious: 'of previous',
      funnelNote:
        'Page views come from your listing’s web page, while interest comes from swipes in the Just Go app — so the first two steps aren’t the same crowd, and interest can run ahead of views.',

      chartTitle: 'Last 14 days',
      chartViews: 'Page views',
      chartInterest: 'New interest',
      chartPeak: (value) => `peak ${value}`,
      chartTotal: (value) => `${value} total`,
      chartScaleNote:
        'Each series is scaled to its own peak, so heights show each trend’s shape rather than one against the other.',
      chartEmpty: 'No views or new interest in the last 14 days.',
      chartAlt: 'Page views and new interest over the last 14 days.',

      firstTouchNote:
        'New interest is counted on the day someone first swiped, which is why the trend can move before a ticket does.',

      draftZeroTitle: 'nothing to count yet',
      draftZeroBody:
        'Your listing isn’t in the app yet, so there’s nothing to measure. Numbers start the week Just Go publishes the drop.',
      liveZeroTitle: 'no signal yet',
      liveZeroBody:
        'Your listing is live. This fills in as people scroll past it and tap through.',
    }),

    comingSoon: Object.freeze({
      communicationsTitle: 'communications',
      communicationsBody:
        'There’s no Just Go–safe way to message interested people yet, so we’re not pretending there is. Reach people through your own channels for now.',
    }),
  }),

  form: Object.freeze({
    sectionBasics: 'The basics',
    sectionWhen: 'When',
    sectionHost: 'Who’s hosting',
    sectionExtras: 'Tickets and tags',

    nameLabel: 'Event name',
    namePlaceholder: 'Rooftop listening party',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'What should people expect? Keep it short and real.',
    startLabel: 'Starts',
    endLabel: 'Ends',
    endHint: 'Optional. We’ll assume two hours if you leave it blank.',
    locationLabel: 'Location',
    locationPlaceholder: 'Venue or neighborhood',
    hostNameLabel: 'Host name',
    hostNameHint: 'This is the name people see on your listing.',
    externalLinkLabel: 'Ticket or RSVP link',
    externalLinkPlaceholder: 'https://',
    externalLinkHint: 'Where people go to grab a spot. Just Go doesn’t sell tickets yet.',
    tagsLabel: 'Tags',
    tagsHint: 'Helps us place your listing in the right corner of the city.',
    tagsEmpty: 'No tags available for your city yet.',
    coverLabel: 'Cover image',
    coverUploadText: 'Add a cover image',
    coverHint: 'Landscape looks best. Max 5MB.',

    submitCreate: 'Submit for curation',
    submitCreateBusy: 'Submitting…',
    submitEdit: 'Save changes',
    submitEditBusy: 'Saving…',
    cancel: 'Cancel',
    savedNotice: 'Saved. Just Go sees your latest version.',
    coverUploadFailed:
      'Your listing saved, but the cover image didn’t upload. Try adding it again.',
    validationSummary: 'Check the highlighted fields before submitting.',

    errors: Object.freeze({
      nameRequired: 'Give your event a name.',
      locationRequired: 'Add a location so people can find it.',
      hostNameRequired: 'Add the host name people will see.',
      startRequired: 'Pick when it starts.',
      startInvalid: 'That start time isn’t a valid date.',
      endInvalid: 'That end time isn’t a valid date.',
      endBeforeStart: 'The end time has to be after the start.',
      externalLinkInvalid: 'Links need to start with http:// or https://.',
    }),
  }),

  status: Object.freeze({
    draft: 'Draft',
    staged: 'In curation',
    published: 'Live',
    unknown: 'Not submitted',
  }),

  statusHelp: Object.freeze({
    draft: 'With Just Go for review.',
    staged: 'Picked for a drop — not in the app yet.',
    published: 'Live in the app.',
  }),

  /** Flare register — post-submit confirmation. */
  submitConfirm: Object.freeze({
    title: 'you’re in the pile',
    eyebrow: 'submitted',
    /** Locked expectation-setting copy. Names the target drop week when we know it. */
    body: (batchWeek) =>
      batchWeek
        ? `Submitted for this week’s curation (${batchWeek}). It won’t appear in the app until Just Go publishes the drop.`
        : 'Submitted for this week’s curation. It won’t appear in the app until Just Go publishes the drop.',
    parity:
      'No special treatment yet — once it’s live it behaves like every other Just Go listing.',
    weekLabel: 'drop week',
    openListing: 'Open your listing',
    createAnother: 'Submit another',
    backToList: 'Back to your listings',
  }),
});

export default justGoCreatorCopy;
