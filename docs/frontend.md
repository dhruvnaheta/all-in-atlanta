# Frontend development

The site remains a static HTML/CSS application using native JavaScript modules. There is no frontend build step. Serve it over HTTP rather than opening `index.html` with a `file:` URL.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4173. Set `PORT` to use a different port.

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
