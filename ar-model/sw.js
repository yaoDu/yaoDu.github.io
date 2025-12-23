/**
 * Service Worker for AR Demo - Offline Support
 * Enables full offline functionality with cache-first strategy
 */

const CACHE_NAME = 'ar-demo-v1';
const RUNTIME_CACHE = 'ar-demo-runtime-v1';

// Critical assets to pre-cache on installation
const PRECACHE_ASSETS = [
  './index.html',
  './app.js',
  './models/pagoda.glb',
  './models/Pagoda.usdz',
  '../models/mobilenetv2.onnx',
  '../models/labels.json',
  '../lib/ort/ort.min.js',
  '../lib/ort/ort.min.mjs',
  '../lib/ort/ort-wasm-simd.wasm',
  '../lib/ort/ort-wasm-simd.mjs',
  '../lib/ort/ort-wasm-simd.jsep.wasm',
  '../lib/ort/ort-wasm-simd.jsep.mjs',
  '../lib/ort/ort-wasm.wasm',
  '../vendor/model-viewer/model-viewer.min.js',
  '../network-icon.png',
  '../assets/sample.jpg'
];

/**
 * Install Event - Pre-cache critical assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching critical assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[SW] All assets cached successfully');
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Pre-cache failed:', error);
        // Don't fail installation if cache fails
        return self.skipWaiting();
      })
  );
});

/**
 * Activate Event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old caches that don't match current version
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        // Claim all clients immediately
        return self.clients.claim();
      })
      .catch((error) => {
        console.error('[SW] Activation failed:', error);
      })
  );
});

/**
 * Fetch Event - Cache-first strategy with network fallback
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // Return cached response if available
        if (cachedResponse) {
          console.log('[SW] Serving from cache:', url.pathname);
          return cachedResponse;
        }

        // Otherwise, fetch from network
        console.log('[SW] Fetching from network:', url.pathname);
        return fetch(request)
          .then((networkResponse) => {
            // Cache successful responses for future use
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(RUNTIME_CACHE)
                .then((cache) => {
                  cache.put(request, responseClone);
                })
                .catch((error) => {
                  console.warn('[SW] Runtime cache failed:', error);
                });
            }
            return networkResponse;
          })
          .catch((error) => {
            console.error('[SW] Network fetch failed:', error);
            
            // Provide offline fallback for HTML requests
            if (request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }
            
            throw error;
          });
      })
      .catch((error) => {
        console.error('[SW] Fetch handler error:', error);
        throw error;
      })
  );
});

/**
 * Message Event - Handle messages from clients
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] Clearing all caches');
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

console.log('[SW] Service worker script loaded');
