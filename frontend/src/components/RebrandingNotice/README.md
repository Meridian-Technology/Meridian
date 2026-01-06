# Rebranding Notice Component

This component displays a notice to users visiting study-compass.com about the rebranding to Meridian.

## Features

- Shows a modal notice when users visit study-compass.com
- 10-second countdown timer before automatic redirect to meridian.study
- "Skip Now" button for immediate redirect
- Only shows once per user (stored in localStorage)
- Responsive design for mobile and desktop
- Professional styling with animations

## Usage

The component is automatically included in the main App.js and will show when:
- User visits study-compass.com or www.study-compass.com
- User is on localhost (for development)
- User hasn't seen the notice before

## Testing

To test the rebranding notice during development, add the query parameter `?test-rebranding=true` to your URL:

```
http://localhost:3000/?test-rebranding=true
```

This will bypass the localStorage check and show the notice even if you've seen it before.

## Styling

The component uses SCSS with:
- Modern gradient backgrounds
- Smooth animations and transitions
- Responsive design
- Professional typography
- Backdrop blur effects

## LocalStorage

The component uses localStorage to track if a user has seen the notice:
- Key: `hasSeenRebrandingNotice`
- Value: `true`

This prevents the notice from showing repeatedly to the same user.
