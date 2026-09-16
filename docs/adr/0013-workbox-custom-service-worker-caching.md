---
status: accepted
date: 2026-09-15
decision-makers: [rapjul, Codex]
consulted: []
informed: []
---

# Use Workbox Modules for Custom PWA Caching

## Context and Problem Statement

The project already uses Vite PWA's `injectManifest` strategy, but its custom service worker manually implemented precaching, cache cleanup, and cache-first/network-first routing. That duplicated mature Workbox behavior and made cache-version migration harder to reason about. The application also has a composed PWA controller that owns registration, update UI, and cache-control messaging; those public contracts must remain stable.

## Decision Drivers

* Preserve the offline app shell, generated-asset cache, and current update behavior.
* Delegate precaching, route matching, and stale Workbox precache cleanup to maintained Workbox modules.
* Keep the PWA controller, its update toast, and its public cache-control protocol independent from worker implementation details.
* Remove legacy caches safely without deleting caches that belong to other applications under the same origin.

## Considered Options

* Use Workbox modules in the existing `injectManifest` worker.
* Retain the handwritten cache implementation.
* Replace the worker and controller with Vite PWA's generated worker and `virtual:pwa-register`.

## Decision Outcome

Chosen option: "Use Workbox modules in the existing `injectManifest` worker", because it replaces the duplicated caching machinery while retaining the app-specific controller contracts already covered by Chromium tests.

The worker uses Workbox's `precache`, `addRoute`, `cleanupOutdatedCaches`, `CacheFirst`, `NetworkFirst`, and navigation routing. It configures the `web-arpeggiator-` cache namespace, retains network-first handling for documents and mutable manifest assets, and falls back to the precached app shell offline. The precache route is intentionally registered after those routes so it does not override their freshness policy.

The existing controller remains the only registration and update-UI owner. The worker keeps the `SKIP_WAITING`, `listCaches`, and `clearCaches` message protocol. A narrowly matched activation migration removes cache names emitted by the former versioned worker; Workbox manages ongoing precache cleanup after that transition.

### Consequences

* Good, because generated assets, runtime routes, and stale precaches now use Workbox's maintained implementations.
* Good, because existing PWA controller and browser-test contracts continue to protect registration, offline loading, and cache control behavior.
* Bad, because the custom worker now has explicit Workbox module dependencies and must retain ordering between mutable routes and the precache route.
* Neutral, because `virtual:pwa-register` remains a future option once its registration and update lifecycle can preserve the current controller behavior.

### Confirmation

`tests/e2e/pwa.test.ts` verifies active registration, offline execution after lazy audio-module loading, and cache clearing that leaves an unrelated cache untouched. The production build must inject a precache manifest into `sw.js` successfully.

## Pros and Cons of the Options

### Use Workbox Modules in the Existing `injectManifest` Worker

* Good, because Vite PWA continues to generate the manifest while Workbox handles the standard service-worker primitives.
* Good, because custom routing and the cache-control message API remain possible.
* Bad, because route order must be kept intentional to preserve network-first documents and manifests.

### Retain the Handwritten Cache Implementation

* Good, because it has no additional direct module imports.
* Bad, because it duplicates cache, install, activation, and routing behavior provided by Workbox.
* Bad, because cache-version behavior must be maintained manually.

### Replace the Worker and Controller with a Generated Worker and `virtual:pwa-register`

* Good, because it could further reduce custom registration code.
* Bad, because it would alter the current controller's update and cache-control contracts in the same change.
* Bad, because a generated worker alone cannot provide the existing application-specific message API.

## More Information

* [Vite PWA `injectManifest` guide](https://vite-pwa-org.netlify.app/guide/inject-manifest)
* [Vite PWA registration guide](https://vite-pwa-org.netlify.app/guide/register-service-worker)
* [ADR 0011: Playwright for Browser End-to-End Testing](./0011-playwright-browser-testing.md)
