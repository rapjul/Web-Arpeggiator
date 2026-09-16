# Virtual PWA Registration Follow-up

## Status

Deferred until the current Playwright, PWA-controller, and Workbox PR stack is merged. This is a plan, not a decision to adopt `virtual:pwa-register`.

## Goal

Evaluate whether Vite PWA's `virtual:pwa-register` can simplify service-worker registration and update handling without changing the application's offline, cache-control, or update-notification contracts.

## Why It Is Deferred

The existing `src/pwa/pwa.js` controller owns more than registration: it cleans up workers during ordinary local development, exposes registration state, and sends the custom worker's `SKIP_WAITING`, `listCaches`, and `clearCaches` messages. The current worker also activates immediately with `skipWaiting()`. Replacing registration without deciding the intended update experience would add indirection without removing those responsibilities.

## Preconditions

1. Merge the current PR stack into `main` in order: Playwright refactor, PWA controller coverage, then Workbox caching.
2. Decide the desired user experience for an available update: automatic activation/reload or a user-confirmed reload prompt.
3. Start a new branch from the merged `main`; do not stack this refactor on the Workbox PR.

## Plan

1. Create a focused registration adapter in `src/pwa/pwa.js` that imports `registerSW` from `virtual:pwa-register` while retaining the controller's public return shape.
2. Keep `injectRegister` manual so Vite does not add a second registration script. Route virtual-helper callbacks into the existing PWA state and toast UI.
3. Preserve the local-development unregister/reload path and the custom worker message API for cache inspection, cache clearing, and explicit activation.
4. Choose one update policy and make the worker match it:
   - For automatic updates, retain immediate activation and verify the controller communicates the refreshed state correctly.
   - For a prompt, remove automatic `skipWaiting()`, surface a waiting-worker state, and call the existing `SKIP_WAITING` protocol only after user confirmation.
5. Remove only the manual registration and update-listener code that the virtual helper actually replaces. Keep cache commands, readiness lookup, and unsupported-browser handling unless equivalent behavior is proven.
6. Update the PWA unit tests to mock the registration adapter and verify registration errors, update callbacks, and the chosen activation policy.
7. Extend Chromium coverage for first install, an available update, offline reload, and the cache-control API after the registration refactor.

## Non-Goals

- Do not replace the custom `injectManifest` worker or Workbox routing.
- Do not remove the cache-control message protocol.
- Do not change cache strategies or cache limits as part of this refactor.
- Do not adopt the helper solely to reduce a small amount of code.

## Completion Criteria

- There is exactly one service-worker registration path in production.
- The chosen update experience is user-visible, tested, and documented.
- Existing offline launch, cache clearing, and unrelated-cache preservation scenarios still pass.
- Formatting, typecheck, lint, unit coverage, production build, and the complete Chromium suite pass.

## Decision Rule

Close this plan without implementation if the virtual helper does not materially simplify the controller or improve the update experience. The current manual registration remains a supported Vite PWA configuration for a custom `injectManifest` worker.
