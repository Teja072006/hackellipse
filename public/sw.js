
// Basic service worker for PWA caching

const CACHE_NAME = 'skillforge-cache-v1';
const urlsToCache = [
  '/',
  '/home',
  '/search',
  '/upload',
  '/chat',
  '/profile',
  '/settings',
  '/login',
  '/register',
  '/forgot-password',
  '/manifest.json',
  // Add paths to your main CSS and JS bundles if known and static
  // e.g., '/_next/static/css/... .css', '/_next/static/chunks/... .js'
  // This part is tricky with Next.js's hashed filenames.
  // Next-PWA plugin handles this better automatically.
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install event fired.');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Opened cache:', CACHE_NAME);
        // Add essential assets that are always needed.
        // Be careful not to cache everything, especially API calls or dynamic content by default.
        return cache.addAll(urlsToCache.filter(url => !url.startsWith('/_next/static/chunks/'))); // Avoid caching dynamic chunks initially
      })
      .catch(error => {
        console.error('[Service Worker] Cache open/addAll failed:', error);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate event fired.');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // For navigation requests, try network first, then cache (Network-first strategy)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If the response is good, clone it and store it in the cache.
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, try to serve from cache.
          return caches.match(event.request)
            .then((response) => {
              return response || caches.match('/'); // Fallback to home page or a generic offline page
            });
        })
    );
    return;
  }

  // For other requests (CSS, JS, images), use a Cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Not in cache - fetch from network, then cache it
        return fetch(event.request).then(
          (networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            return networkResponse;
          }
        );
      })
      .catch(error => {
        console.error('[Service Worker] Fetch failed; returning offline page instead.', error);
        // Optionally, return a custom offline page:
        // return caches.match('/offline.html'); 
      })
  );
});
