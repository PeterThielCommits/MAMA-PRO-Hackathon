/* Only build-generated public assets. API/private navigation never enter caches. */
const VERSION='__QZ_BUILD_VERSION__';
const PREFIX='qoldau-public-shell-';
const SHELL=PREFIX+VERSION;
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const response=await fetch('/app-shell.json',{cache:'no-store'});
 if(!response.ok)throw Error('SHELL_UNAVAILABLE');
 const manifest=await response.json();
 // A deployment can change between fetching the worker and fetching its manifest.
 // Do not install a worker against assets from a different release.
 if(manifest.version!==VERSION)throw Error('SHELL_VERSION_MISMATCH');
 const cache=await caches.open(SHELL);
 await cache.addAll(manifest.assets.map(path=>new Request(new URL(path,self.location.origin),{cache:'reload'})));
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const names=await caches.keys();
 await Promise.all(names.filter(n=>n.startsWith(PREFIX)&&n!==SHELL).map(n=>caches.delete(n)));
 await self.clients.claim();
})()));
function routePath(path){
 try{return decodeURI(path).toLowerCase();}catch{return path.toLowerCase();}
}
function belongsTo(path,prefix){return path===prefix||path.startsWith(prefix+'/');}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 const path=routePath(url.pathname);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||belongsTo(path,'/api'))return;
 if(event.request.mode==='navigate'){
  event.respondWith((async()=>{try{return await fetch(event.request);}catch{
   return (await caches.match(belongsTo(path,'/pilot')?'/offline.html':'/index.html',{cacheName:SHELL}))||Response.error();
  }})());return;
 }
 if(url.pathname.startsWith('/assets/')||['/icon.svg','/manifest.webmanifest'].includes(url.pathname))event.respondWith((async()=>{
  const cached=await caches.match(event.request,{cacheName:SHELL}).catch(()=>undefined);
  return cached||fetch(event.request);
 })());
});
