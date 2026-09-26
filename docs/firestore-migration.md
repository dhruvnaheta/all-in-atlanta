# Native Firestore migration

Status: production migration completed on 2026-09-26 UTC.
The native namespace is live, all four callable functions are deployed, and
GitHub Pages serves application code from release `628097c19725a2301d26cfd66da1b4c79bbb7a8f`.
A fresh frozen-source snapshot and exact verification preserved 231 players,
29 history entries, 13 attendance records, 3 series, 8 scheduled games, and
1,336 native documents. Preserved totals are 692 points, 66 monthly points,
and 510 games. Original legacy documents and all local backups are retained.

Billing, Email/Password Authentication, and backend APIs are enabled. Two admin
accounts have verified custom claims; their private setup links are saved under
the ignored backups directory. No setup emails were sent.

Validation: unit tests, lint, 8 browser UI tests, 9 backend integration tests,
full-backup synchronization, resumable migration CLI checks, and the browser flow
against Auth/Firestore/Functions emulators passed. Live browser verification
confirmed counts/totals, admin sign-in availability, private-field exclusion,
legacy cache removal, and 404 responses for private/backend deployment artifacts.

## Schema

All new data lives under `leagues/atlanta-v2`:

- `players/{encodedLegacyKey}`: public profile, standings, preserved legacy adjustments.
- `playerContacts/{encodedLegacyKey}`: administrator-only email, phone, recovery notes.
- `series/{id}`: recurring schedule.
- `games/{id}`: native game metadata; `scheduled` controls schedule visibility.
- `games/{id}/participants/{encodedLegacyKey}`: optional live `checkIn`, historical `results`, and original attendance details.
- `games/{id}/runtime/timer`: game-specific timer and duration overrides.
- `history/{id}`: one native document per original history entry or finalized game.
- `legacyAttendance/{id}`: private, complete original attendance records.
- `settings/current`: active game pointer and schema version.
- `operations/control`: publication gate, write-maintenance gate, migration checksum.

Identifiers use URI-encoded immutable legacy keys with a `p_` prefix for players.
Editing a display name never changes the player ID. History entries without a game
ID receive stable index-based migration IDs. Unknown series remain null. Attendance
is only associated using explicit IDs; dates are not used to guess relationships.
The original snapshot is retained separately and never modified.

The converter preserves every player field exactly, splitting private fields out.
It does not recompute totals from incomplete history or run legacy attendance
backfills on login. Missing historical profiles remain references, not fabricated
players. History retains original results and metadata, including duplicate game
associations. JSON blobs and the retired password document are not migrated.

The existing screens use a compatibility view model. Its writes become per-document,
per-field patches checked in server transactions. Competing changes to the same
field fail visibly; unrelated edits can coexist. Check-in and finalization use
server-side transactions. A game finalization receipt makes retries idempotent,
including empty stopped games. Finalized games cannot be reopened for scoring.
Client writes are denied by rules; authenticated admin callables enforce access.

## Offline conversion

```sh
node scripts/convert-backup.js backups/pre-refactor-2026-09-26T01-08-17-576Z/firestore.json backups/v2-dry-run
```

This verifies `SHA256SUMS` and writes a private native-document plan and reconciliation
report under the ignored `backups/` directory. Initial rehearsal: 231 players,
8 scheduled games, 29 history entries, 13 attendance records, 3 series, 1,336 native
documents. Preserved totals: 692 points, 66 monthly points, 510 games. There are
45 references to missing historical profiles and 26 explicitly recorded association
warnings. These are retained without rewriting league history.

## Validation

```sh
npm test
npm run lint
npm run test:rules
BACKUP_FILE=backups/pre-refactor-2026-09-26T01-08-17-576Z/firestore.json npm run test:migration
npm run test:e2e
```

The full-backup test imports only into `demo-all-in-atlanta`, compares the view model,
checks private/public reads, and verifies contacts are removed on logout and never
persisted in localStorage. Transaction tests cover simultaneous edits, check-ins,
result retries, maintenance, and rule boundaries. End-to-end testing uses installed
Google Chrome and local Auth/Firestore/Functions emulators. The emulator frontend
URL must include `?emulator=1`.

## Deployment and cutover

1. Enable Blaze, Email/Password Authentication, and required Functions APIs. Create
   the agreed admin user and grant its `admin` custom claim with
   `node scripts/grant-admin.js PROJECT_ID EXISTING_USER_EMAIL` using application
   default credentials. Verify actual administrator sign-in before retiring the
   old app. Do not reuse the backed-up password document.
2. Record the current GitHub Pages commit and save deployed Firestore rules and
   indexes separately. The JSON data backup does not contain Auth, rules, indexes,
   or Storage. The existing site deploys from `main` at repository root.
3. Deploy `firebase deploy --only functions --project all-in-atlanta-pok`. New
   callables remain closed until `operations/control.writesEnabled` is true.
4. Schedule cutover between games. Verify the active game is idle with no check-ins.
   Deploy the new `firestore.rules` to stop legacy client reads/writes and protect
   new private documents. This starts a short maintenance window. Also stop any
   other privileged writers; Firestore Admin clients bypass rules.
5. Take a **fresh** snapshot after writes are stopped:

   ```sh
   node scripts/migrate-firestore.js backup all-in-atlanta-pok backups/cutover --firebase-cli-auth
   node scripts/convert-backup.js backups/cutover/firestore.json backups/cutover/converted
   node scripts/migrate-firestore.js import all-in-atlanta-pok backups/cutover --firebase-cli-auth
   node scripts/migrate-firestore.js verify all-in-atlanta-pok backups/cutover --firebase-cli-auth
   ```

   The CLI flag uses your existing local Firebase CLI sign-in; otherwise use ADC.
   Import refuses live targets or a different migration checksum. Rerunning the
   same unpublished plan is safe. It leaves the original `aia` documents untouched.
   Verification compares every native field and checks for unexpected documents.
6. Deploy the updated static files together (`index.html`, `styles.css`, `js/`,
   `assets/`) through the existing GitHub Pages workflow. Backups and backend sources
   must never be included in a public deployment artifact. Wait for Pages to finish.
7. Publish only after the new frontend and backend are available:

   ```sh
   node scripts/migrate-firestore.js publish all-in-atlanta-pok backups/cutover --firebase-cli-auth
   ```

   This re-verifies the imported data before enabling public reads and server writes.
   Smoke-test public standings, administrator sign-in, game selection and timer.
   Verify denied public access to contacts, legacy data and backup collections.
8. Keep the old schema read-only and retain all backups. Do not delete source data
   as part of this migration. After new writes begin, snapshot equality with the
   migration input is no longer expected.

## Rollback

Before the first v2 write: pause v2 writes, restore the recorded frontend commit and
previous rules, and resume legacy writers. The original `aia` documents are intact.
Restoring previous permissive rules can expose private v2 data; add explicit v2
protection and remove broad wildcard grants before restoring legacy access.

After any v2 write: first pause using the command below and export v2 data. Reconcile
new registrations, contact changes, score awards, schedule changes and check-ins
back into the legacy snapshot before switching back. Never blindly restore the
pre-cutover snapshot over live updates. Keep the website in maintenance until that
reconciliation is reviewed. No automatic destructive rollback is provided.

```sh
node scripts/migrate-firestore.js pause all-in-atlanta-pok backups/cutover --firebase-cli-auth
```

All callable writes read this maintenance gate inside their transaction. Pausing
it conflicts with and retries in-flight transactions before new writes can commit.
