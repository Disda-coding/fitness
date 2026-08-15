// Service Worker: 健身追踪器 PWA 离线支持
const CACHE_NAME = 'fitness-tracker-v3';

// 预缓存的应用外壳资源
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sw.js',
  '/icon.svg',
  '/icon-maskable.svg',
];

// 第三方CDN资源（Tailwind/字体/图标），离线时也需要
const CDN_URLS = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap',
];

// 带超时的fetch（解决被墙时fetch长时间挂起的问题）
function fetchWithTimeout(request, timeoutMs) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('sw-timeout')), timeoutMs)
    )
  ]);
}

// 安装：预缓存所有静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        // 预缓存应用外壳（失败会导致install失败重试，保证离线可用性）
        await cache.addAll(PRECACHE_URLS);
        // CDN资源尽力缓存，失败不阻塞
        await Promise.allSettled(
          CDN_URLS.map(async (url) => {
            try {
              const resp = await fetchWithTimeout(url, 15000);
              if (resp) await cache.put(url, resp);
            } catch (e) { /* CDN缓存失败忽略 */ }
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// 请求拦截策略：
// 1. 导航请求（页面）→ 缓存优先（保证离线秒开），后台更新
// 2. API请求 → 网络优先 + 8秒超时，超时/失败返回离线JSON（数据走localStorage）
// 3. 其他静态资源/CDN → 缓存优先 + 后台更新
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API请求不缓存，但加超时防止挂起
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetchWithTimeout(event.request, 8000)
        .catch(() => {
          return new Response(JSON.stringify({ error: 'offline', offline: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // 页面导航：缓存优先（离线可秒开），后台静默更新（同时更新导航URL和/index.html两个缓存条目）
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetchWithTimeout(event.request, 10000)
          .then((resp) => {
            if (resp && resp.status === 200) {
              const c1 = resp.clone();
              const c2 = resp.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, c1);   // 更新实际导航URL（如 /）
                cache.put('/index.html', c2);   // 更新标准入口
              });
            }
            return resp;
          })
          .catch(() => cached || caches.match('/index.html'));
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 静态资源：缓存优先 + 后台更新
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// 接收主线程消息
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
