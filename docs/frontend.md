# Frontend development

The site remains a static HTML/CSS application using native JavaScript modules. There is no frontend build step. Serve it over HTTP rather than opening `index.html` with a `file:` URL.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4173. Set `PORT` to use a different port.

Local development uses production Firestore, Firebase Auth, and callable Functions
in `all-in-atlanta-pok`, including live reads and writes. Sign in with your existing
production account. Emulators are used only when you explicitly open the local URL
with `?emulator=1`; omit that parameter for production services.

## Code map

- `index.html`: public page content, navigation, metadata, and the admin overlay shell.
- `styles.css` and `assets/logo.png`: extracted styles and the shared logo.
- `js/main.js`: startup, event registration, authentication notifications, and remote refreshes.
- `js/events.js`: delegated event listeners for static and dynamically rendered markup. `data-click`, `data-input`, and related attributes identify actions; argument attributes contain data, never executable JavaScript.
- `js/store.js` and `js/state.js`: cached state, subscriptions, and accessors used by the views.
- `js/firebase.js`: the remote persistence and authentication adapter.
- `js/scoring.js`: points, attendance ledgers, duplicate protection, and historical/current streak schedules. Calculations do not access the DOM or write data.
- `js/timer.js`: pure timer calculations. `js/timer-controller.js` owns polling and persistence; `js/views/timer.js` renders the public, TV, and admin clocks.
- `js/checkin.js`: shared public/admin check-in service and search matching. `js/checkin-model.js` validates registration and attendance changes independently of rendering.
- `js/views/`: public and admin rendering. Admin sections, game controls, check-in, player management, timer settings, and dialogs have separate responsibilities.
- `js/refresh.js`: connects view refresh requests to renderers at startup without circular view imports.

Keep scoring and timer calculations independent of storage and the browser. Add new actions to the explicit registry in `main.js`; do not add global functions or inline event handlers. Admin action guards improve UI behavior, while authentication and server-side authorization enforce access.

## Verification

```sh
npm test
npm run lint
npm run test:browser
```

Unit tests cover scoring, repeated submissions, partial-save recovery, schedule transitions, timer boundaries and pause/resume, check-in validation, failed writes, and remote synchronization. Browser tests cover navigation, names containing apostrophes, keyboard check-in, admin scoring, timer controls, preserving a registration draft during remote updates, and mobile navigation.

Browser tests replace the Firebase adapter and block external requests; they do not write production data. Locally they use installed Google Chrome. In CI, install Playwright Chromium with `npx playwright install --with-deps chromium` and set `CI=1`.

Database integration tests require the Firestore emulator and must match the deployed storage schema. The database schema migration is separate from the frontend module extraction; coordinate its adapter, rules, functions, and data rollout together before publishing the refactored application.

## Game operations and live views

Game records now expose `status: scheduled | running | completed` and a separate
`registrationOpen` flag. `normalizeGame` reads old `idle/open/closed` records without
a bulk data rewrite. A completed/finalized game cannot restart; schedule another
instance. Closing registration blocks public check-in. Admins can still add late
arrivals, and only admins can remove attendance.

`js/commands.js` calls the authenticated `manageLeague` function in
`backend/commands.js`. Starting, activating, launching, changing registration,
controlling the clock, clearing attendance, and deleting data are server
transactions. Legacy mirrored game-state writes have been removed. The cache
contains confirmed state; views await saves and retain drafts when a request fails.
Player-stat calculations and name-based identities remain unchanged.

The blind clock is derived from its persisted timestamp, level durations and paused
remaining time. Display polling never writes to Firestore. It catches up through
multiple levels/breaks after a reload or sleeping browser, and repeats the final
blind level. Server clock commands carry a revision: a competing stale command is
rejected instead of overwriting another admin's pause or reset. Changing a duration
preserves time already elapsed in the current level.

`js/native-sync.js` subscribes to participants and runtime only for the active game.
Snapshots publish changed slices, and `main.js` refreshes their dependent views.
`js/drafts.js` stores registration and finish-position drafts separately from server
state. `js/render.js` reconciles DOM nodes so routine updates do not replace focused
inputs. Private drafts are cleared on sign-out. The existing public history/ranking
model is retained for the later scoring redesign.

Large destructive operations reject before writing if they exceed 490 writes;
they never perform a partial wipe. A larger cleanup needs a staged maintenance
operation. Schedule deletion preserves recorded results; a full wipe also removes
results and contacts.

Run the server and complete browser integration checks using the demo project:

```sh
npm run test:rules
npm run test:operations-e2e
```

The second command uses real local Auth, Functions and Firestore emulators, not the
mock gateway. It verifies failed saves, registration enforcement, attendance
removal authorization, scoring, and clock recovery across a browser reload.
Java and Firebase CLI are required; the browser test uses installed Google Chrome.

Deploy the updated functions (including `manageLeague`) with the matching frontend.
The older frontend's generic game patches are intentionally rejected. Existing
Firebase admin claims remain the authorization boundary; no additional sign-in
provider or account migration is introduced by these changes.

Public navigation uses `/about/`, `/rankings/`, `/games/`, `/rules/`,
`/restrictions/`, `/account/`, and `/tv/`. The root HTML files with Jekyll
front matter include `index.html` at build time so GitHub Pages serves each
address directly. Keep these route files when publishing from the repository
root. The local preview server maps these same paths to the app shell.
