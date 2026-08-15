// Service Worker: 健身追踪器 PWA 离线支持
const CACHE_NAME = 'fitness-tracker-v1';

// 预缓存的应用外壳资源
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-maskable.svg',
];

// 第三方CDN资源（Tailwind/字体/图标），离线时也需要
const CDN_URLS = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap',
];

// 安装：预缓存所有静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // CDN资源单独处理，失败不阻塞安装
        CDN_URLS.forEach(url => {
          fetch(url, { mode: 'no-cors' })
            .then(resp => cache.put(url, resp))
            .catch(() => {});
        });
        return cache.addAll(PRECACHE_URLS);
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
// 1. 导航请求（页面）→ 网络优先，失败回退缓存（离线可用核心）
// 2. API请求 → 网络优先，失败返回离线JSON标记（应用层数据走localStorage，不依赖SW缓存）
// 3. 静态资源/CDN → 缓存优先，后台更新
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API请求不缓存（数据同步由应用层管理）
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'offline', offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 页面导航：网络优先，离线回退
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          return resp;
        })
        .catch(() => caches.match('/index.html'))
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

// 接收主线程消息：手动触发缓存更新
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
