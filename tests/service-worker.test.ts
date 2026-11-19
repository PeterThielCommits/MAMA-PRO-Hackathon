import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const script = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://demo.example';
const prefix = 'qoldau-public-shell-';
function worker(version: string) {
  const listeners = new Map<string, (event: unknown) => void>();
  const addAll = vi.fn(async (_requests: Request[]) => {});
  const caches = {
    keys: vi.fn(async () => [`${prefix}${version}`, `${prefix}other`, 'unrelated']),
    open: vi.fn(async () => ({ addAll })),
    match: vi.fn(async (request: string | Request, { cacheName }: { cacheName: string }) =>
      new Response(`${cacheName}:${typeof request === 'string' ? request : new URL(request.url).pathname}`)),
    delete: vi.fn(async () => true),
  };
  const fetch = vi.fn(async (_request: Request | string): Promise<Response> => { throw new Error('Network offline'); });
  runInNewContext(script.replace('__QZ_BUILD_VERSION__', version), {
    Request, Response, URL, fetch, caches,
    self: {
      location: { origin },
      clients: { claim: vi.fn() },
      addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
    },
  });
  function lifecycle(name: 'activate' | 'install') {
    let result: Promise<void> | undefined;
    listeners.get(name)!({ waitUntil: (promise: Promise<void>) => { result = promise; } });
    return result!;
  }
  function dispatch(path: string, mode = 'navigate', method = 'GET') {
    let result: Promise<Response> | undefined;
    listeners.get('fetch')!({
      request: { url: new URL(path, origin).href, mode, method },
      respondWith: (promise: Promise<Response>) => { result = promise; },
    });
    return result;
  }
  return { lifecycle, dispatch, caches, fetch, addAll };
}

describe('versioned public service worker', () => {
  it('uses its own cache after a cold start even when a newer worker has already filled another cache', async () => {
    const w = worker('current');
    expect(await (await w.dispatch('/specialists/S01'))?.text()).toBe(`${prefix}current:/index.html`);
    expect(await (await w.dispatch('/assets/app.js', 'cors'))?.text()).toBe(`${prefix}current:/assets/app.js`);
    expect(w.caches.keys).not.toHaveBeenCalled();
  });

  it('rejects a manifest for a different deployment and refreshes HTTP-cached assets during install', async () => {
    const w = worker('current');
    w.fetch.mockResolvedValueOnce(Response.json({ version: 'other', assets: ['/index.html'] }));
    await expect(w.lifecycle('install')).rejects.toThrow('SHELL_VERSION_MISMATCH');
    expect(w.caches.open).not.toHaveBeenCalled();
    w.fetch.mockResolvedValueOnce(Response.json({ version: 'current', assets: ['/index.html'] }));
    await w.lifecycle('install');
    expect(w.caches.open).toHaveBeenCalledWith(`${prefix}current`);
    const [[assets]] = w.addAll.mock.calls;
    expect(assets.map(r => [r.url, r.cache])).toEqual([[`${origin}/index.html`, 'reload']]);
  });

  it('leaves API, mutations and cross-origin requests alone; pilot gets only the offline notice', async () => {
    const w = worker('current');
    for (const [path, method] of [['/api', 'GET'], ['/API/pilot/state', 'GET'], ['/privacy', 'POST'], ['https://other.example/', 'GET']]) {
      expect(w.dispatch(path, 'navigate', method)).toBeUndefined();
    }
    for (const path of ['/pilot', '/PILOT/', '/%70ilot?code=demo']) {
      expect(await (await w.dispatch(path))?.text()).toBe(`${prefix}current:/offline.html`);
    }
    await w.lifecycle('activate');
    expect(w.caches.delete.mock.calls).toEqual([[`${prefix}other`]]);
  });
});
