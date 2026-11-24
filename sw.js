/* ST Jewelry service worker — build 202611240807 */
const V='jewelry-202611240807';
const CDN=/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//;
self.addEventListener('install',function(e){self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==V;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
function key(u){return u.origin+u.pathname;}
self.addEventListener('fetch',function(e){var r=e.request;if(r.method!=='GET')return;var u=new URL(r.url);
 if(u.origin===location.origin&&(r.mode==='navigate'||/\.(html|webmanifest|png|svg)$/.test(u.pathname)||/\/$/.test(u.pathname))){
  e.respondWith(new Promise(function(ok){var done=false,k=key(u),
   fromCache=function(){return caches.open(V).then(function(c){return c.match(k);});},
   t=setTimeout(function(){fromCache().then(function(m){if(m&&!done){done=true;ok(m);}});},4000);
   fetch(r).then(function(res){clearTimeout(t);if(done)return;done=true;if(res&&res.ok&&res.type==='basic'){var cp=res.clone();caches.open(V).then(function(c){c.put(k,cp);});}ok(res);})
    .catch(function(){clearTimeout(t);if(done)return;fromCache().then(function(m){done=true;ok(m||Response.error());});});}));return;}
 if(CDN.test(r.url)){e.respondWith(caches.open(V).then(function(c){return c.match(r).then(function(m){var f=fetch(r).then(function(res){if(res&&(res.ok||res.type==='opaque'))c.put(r,res.clone());return res;}).catch(function(){return m;});return m||f;});}));}
});
