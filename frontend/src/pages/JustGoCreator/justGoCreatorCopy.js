/**
 * Creator-facing copy bank — Just Go voice only.
 * Avoid Atlas / Meridian / ClubDash / campus org language.
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
    title: 'Your listings',
    subtitle: 'Create events for this week’s drop. Just Go reviews every listing before it goes live.',
    emptyTitle: 'No listings yet',
    emptyBody: 'Submit your first event for curation. It won’t appear in the app until Just Go publishes the drop.',
    emptyCta: 'Create a listing',
    comingSoonBadge: 'Console groundwork',
  }),

  newListing: Object.freeze({
    title: 'New listing',
    subtitle: 'Form lands in a later step. For now this route is reserved.',
    backToList: 'Back to your listings',
  }),

  workspace: Object.freeze({
    title: 'Event workspace',
    subtitle: 'Focused dashboard for this listing. Coming soon.',
    backToList: 'Back to your listings',
  }),

  status: Object.freeze({
    draft: 'Draft',
    staged: 'In curation',
    published: 'Live',
  }),

  submitConfirm:
    "Submitted for this week’s curation. It won’t appear in the app until Just Go publishes the drop.",
});

export default justGoCreatorCopy;
