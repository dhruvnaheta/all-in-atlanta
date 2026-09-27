# Administrator access

Use **Admin** in the footer to sign in. The Administrators section lists current
administrators and labels owners. All administrators can add administrators.
Only owners can remove administrators; owners cannot be removed through the UI.
Removal preserves the account and other claims, clears the admin claim, and revokes
refresh tokens. Already-issued ID tokens can remain valid until expiry (up to an hour).

Ownership is a single `owner: true` database flag at
`leagues/atlanta-v2/administratorAccess/{authUid}`. Clients cannot read or write
these documents directly. The server checks the flag on every removal request,
and checks live Auth admin access for listing, adding, and removing administrators.
There is no role editor or browser API for granting ownership.

To set Meg and Julia as the only owners, using their existing admin sign-in emails:

```
node scripts/set-admin-owners.js PROJECT MEG_EMAIL JULIA_EMAIL
```

Deploy `getAdministrators` and `deleteAdministrator` with the frontend (and retain
`addAdministrator`). No Firestore rules change is required.

Adding an administrator sends no invitation. Recipients can use Google sign-in or
Forgot password on the Admin page. Existing accounts retain their passwords and
other claims. Disabled accounts cannot be granted access through the form.

## Google sign-in

Google sign-in uses a popup and the configured Firebase auth domain,
`all-in-atlanta-pok.firebaseapp.com`, on local and hosted deployments. Production
is served by GitHub Pages; authentication helpers are hosted by Firebase.
Do not select the current hostname as `authDomain` just because it uses HTTPS:
that makes Firebase request a missing `/__/auth/iframe` and sign-in can hang.

In Firebase Authentication → Settings → Authorized domains, include
`allinatlanta.com` and any other hostname used for sign-in. Retain the Firebase
OAuth redirect URI, `https://all-in-atlanta-pok.firebaseapp.com/__/auth/handler`,
in the Google provider's OAuth web client. A custom-domain OAuth redirect URI
is not needed for this popup flow.

Allow popups when prompted. Verify an administrator can sign in, a non-admin
is rejected, and closing or blocking the popup leaves the form usable.

See [Firebase popup guidance](https://firebase.google.com/docs/auth/web/redirect-best-practices#option-2).
