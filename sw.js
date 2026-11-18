const CACHE='ixora-studio-v8';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{const keys=await caches.keys(),old=keys.filter(k=>k!==CACHE);await Promise.all(old.map(k=>caches.delete(k)));await self.clients.claim();if(old.length){const cs=await self.clients.matchAll({type:'window'});cs.forEach(c=>c.navigate(c.url))}})()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(res=>{try{const u=new URL(e.request.url);if(res.ok&&(u.origin===location.origin||u.hostname==='staticimgly.com')){let copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}}catch(_){}return res}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))))});
