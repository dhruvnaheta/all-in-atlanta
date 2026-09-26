# Adding administrators

On `/admin/`, use **Administrators → Add administrator** and enter an email.
This grants full administration access, including the ability to add more administrators.
Existing accounts keep their passwords and other custom claims. New emails get an
Auth account; disabled accounts cannot receive access through this form.

No invitation is sent. Tell the recipient to open the Admin sign-in page and use
Google sign-in with that email, or choose **Forgot password** to set a password.
Existing sessions must sign out and sign in again to receive the new access.

The `addAdministrator` callable checks both the caller's token and their current
Firebase Auth record before granting the `admin` custom claim. It does not accept
claim names or arbitrary roles from the browser.

Deploy the `addAdministrator` Cloud Function along with the frontend before using
this feature in production. No Firestore rules change is required for this feature.

Validation:

- `npm test` covers validation, authorization, existing claims, disabled users and retries.
- `npm run test:admin-access` exercises the callable with the Auth and Functions emulators.
- `npx playwright test tests/admin-panel.spec.js` covers the form and error recovery.
