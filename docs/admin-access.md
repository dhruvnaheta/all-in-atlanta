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

## Google sign-in on Vercel

HTTPS deployments use same-tab Google sign-in. `vercel.json` proxies Firebase's
auth helpers through the current domain so browsers can preserve redirect state
without third-party storage access. Local HTTP development keeps the popup flow.
Deploy the frontend and `vercel.json` together.

Before using Google sign-in on a deployment, configure its exact hostname:

1. In Firebase Authentication → Settings → Authorized domains, add
   `allinatlanta.com` (and each Vercel hostname used for sign-in).
2. In Google Cloud → APIs & Services → Credentials, edit the OAuth web client
   used by Firebase's Google provider. Add
   `https://allinatlanta.com/__/auth/handler` to Authorized redirect URIs.
   For a Vercel hostname, add `https://HOSTNAME/__/auth/handler` as well.
3. If `www.allinatlanta.com` serves the app instead of redirecting to the apex,
   register it in both places too. Prefer a stable Vercel staging hostname to
   registering every preview deployment.

These console settings are required; deploying code does not register OAuth
domains. Retain the existing Firebase redirect URI for local popup sign-in.
On the deployed site, verify `/__/auth/iframe` serves Firebase's helper and
`/__/firebase/init.json` serves Firebase configuration, then complete Google
sign-in with an administrator account. Also check a non-admin is rejected and
canceling Google sign-in leaves the admin form usable.

See [Firebase redirect setup](https://firebase.google.com/docs/auth/web/redirect-best-practices)
and [Vercel rewrites](https://vercel.com/docs/routing/rewrites).
