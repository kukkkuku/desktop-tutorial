// Minimal service worker: satisfies PWA installability requirements without
// caching anything, so deploys are always picked up on next load (no stale
// asset risk from the hashed-filename build output).
self.addEventListener('fetch', () => {})
