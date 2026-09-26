> Historical documentation: player sign-in and account pages have been retired.
> Administrators sign in directly at `/admin`; public navigation has no account links.
> Existing account records and administrator unlink tools remain for legacy data maintenance.

# Player accounts and My Stats

The My Stats page is an additional page in the existing static app. A single
**Log In** navigation entry opens the shared sign-in page. After sign-in it reads
**My Account**, opening personal stats for players and the admin view for admins. Public league
pages and guest check-in remain available. Email/password sign-in now accepts both
players and admins; the Firebase `admin: true` custom claim still controls every
administrative operation. Admins signing in through My Stats open the admin view
and can return to their personal page.

Players create an account and verify their email. On sign-in or after verification,
the server automatically links a unique matching private player contact email
(ignoring case and surrounding whitespace). This preserves all existing results,
statistics, names and contacts. No accounts are provisioned or emails sent in bulk.
Unmatched players request an existing profile or a new player name; an admin
confirms identity under **Player Account Requests**. Duplicate contact emails,
already-owned profiles, rejected requests and pending claims for a different
profile are never automatically linked.

The `autoLink` action trusts only the verified authentication token email. It scans
the private contacts inside a transaction, checks the existing profile and ownership,
and records `linkedBy: "verified-email"` and `linkedAt` on the account. At the
current league size this avoids a contact-data migration; a larger league should
use a transactionally maintained normalized email index. Deploy the updated
`managePlayerAccount` function before the matching frontend.

If an older deployed function rejects `autoLink` with “Unknown account action.”,
the frontend continues to the existing manual profile-request flow. Other errors
(including maintenance and permission failures) remain visible. Automatic email
matching requires deploying the current backend:

```sh
firebase deploy --only functions:managePlayerAccount --project all-in-atlanta-pok
```

## Data and permissions

- `leagues/atlanta-v2/accounts/{uid}` holds the private account request, status,
  verified sign-in email at request time, and approved `playerKey`. Only its owner
  and admins can read it; clients cannot write it.
- `leagues/atlanta-v2/playerAccounts/{encodedPlayerId}` is a server-only reverse
  ownership mapping. Approval checks and creates it transactionally, preventing
  two accounts from claiming one profile. Players cannot assign or change links.
- The `managePlayerAccount` callable handles requests, approval, rejection,
  sanitized private profile reads, profile updates, and personal check-in.
  Personal check-in resolves the player from the authenticated UID, ignoring any
  supplied player key. Ownership validation and attendance writes share one
  transaction, so concurrent unlinking, deletion, or merging cannot use stale
  ownership. Existing guest check-in remains a separate public flow.
- Players may edit display name, contact email and phone. The stable player key,
  point totals, results, admin notes and roles cannot be edited through account
  settings. Contact email and Firebase sign-in email are separate.
- Private account/profile state lives in memory and clears on sign-out or account
  switching. Private fields are not written to the league's localStorage cache.
- Published standings/results remain public. Private contact documents remain
  admin-only in Firestore; owners receive only their display name, email and phone
  through the callable, never administrator recovery notes.

My Stats reads the shared `getPlayers()` view model. It does not recompute league
totals, backfill history, or modify scoring. Recent results use that view model's
`gameDates` records. Incomplete records are labeled accordingly. Placement metrics
count recorded wins and top-eight finishes, never invented lower placements.
Streaks follow the shared league schedule and five-game cycle rules.

Links bind to the profile document's
creation timestamp (or a generated identity version for new profiles), so deleting
and recreating the same name does not transfer ownership to a different person.
The administrator's delete-player operation atomically clears linked accounts,
removes the reverse ownership mapping, and rejects pending requests for that key.
Affected users can submit a new claim. Direct maintenance deletions and full league
wipes must still include account mappings in their data plan; stale links fail
identity validation and personal check-in never recreates a missing profile.

Requests for existing players store `requestedPlayerCreatedAt`. Approval and
auto-linking of pending requests require the same profile creation timestamp.
Merging players transfers valid pending requests to the target identity. Older
pending requests without this binding must be rejected and resubmitted; requests
to create a new player still require that the name remain unused at approval.
Deploy both `managePlayerAccount` and `manageLeague` for these lifecycle changes.

## Release

Deploy the new `managePlayerAccount` function and updated Firestore rules before
publishing the matching frontend. Existing Email/Password authentication and admin
claims remain in use. Ensure Email/Password account creation is enabled in the
Firebase project and verify the production verification/password-reset email flow.
The account function and owner/admin-only account read rules were deployed and
verified in production on 2026-09-26 (UTC). The frontend had been published first,
which caused new accounts to see “Missing or insufficient permissions.” The rollout
did not migrate or edit league data. Users with an already-open failed account
listener must reload the page after deployment; their Firebase Auth accounts remain
valid. Tests use the demo project and do not write production data.

## Verification

```sh
node --test tests/personal-stats.test.js
PORT=4183 npm run test:browser -- tests/account.spec.js
npm run test:accounts
```

The account browser integration test uses actual local Firebase SDKs and callables,
separate player/admin browser sessions, and a demo project. It covers signup,
verification, approval, stats, self check-in, private settings, persistence across
reload, and sign-out. Screenshots are written to `test-results/personal-desktop.png`
and `test-results/personal-mobile.png`.
