// Service worker minimale: cache "app shell" per avvio offline.
// Strategia: network-first per la navigazione, cache-first per gli asset.
const CACHE = 'operations-v1'
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  // Le chiamate al database (Supabase) non vanno mai messe in cache.
  if (request.url.includes('supabase')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  )
})
