# Android Tester Signup (Closed Testing)

When the Android app is in closed testing, users can sign up via the mobile landing page. Their emails are stored and can be exported for adding to the Google Play Console.

## Flow

1. User visits `/mobile` and clicks the Play Store badge
2. Modal opens with email form
3. User submits → email stored in `androidTesterSignups` collection
4. Admin exports the list and adds emails to Play Console (Testing → Closed testing → Create email list)

## API Endpoints

- **POST /api/android-tester/signup** (public) – Submit email for testing list
- **GET /api/android-tester/list** (admin) – List all signups (JSON)
- **GET /api/android-tester/export** (admin) – Export as CSV for Play Console

## Adding Testers to Play Console

1. Log in as admin and go to Profile → "Export Android testers" (or visit `/api/android-tester/export` with auth)
2. Download the CSV
3. In Play Console: Your app → Testing → Closed testing → Testers
4. Create or edit an email list, paste the emails from the CSV

## Fully Automatic Option

The Google Play API only supports Google Groups for testers, not individual emails. For true automation you would need to:

1. Create a Google Group for Android testers
2. Link that group in Play Console to the closed testing track
3. Use Google Admin SDK or Groups API to add new signups to the group
