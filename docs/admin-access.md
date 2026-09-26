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
