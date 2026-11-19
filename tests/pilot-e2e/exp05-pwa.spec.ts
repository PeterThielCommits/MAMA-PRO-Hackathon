import { expect, test, type Page } from '@playwright/test';

const SHELL_PREFIX = 'qoldau-public-shell-';

async function controlled(page: Page) {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
async function cacheUrls(page: Page) {
  return page.evaluate(async () => {
    const names = await caches.keys();
    return Promise.all(names.map(async name => ({
      name, urls: (await (await caches.open(name)).keys()).map(request => request.url),
    })));
  });
}

test('production shell manifest is versioned and every declared public asset is served and cached', async ({ page }) => {
  await page.goto('/specialists');
  await controlled(page);
  const manifest = await page.request.get('/app-shell.json').then(response => {
    expect(response.status()).toBe(200); return response.json() as Promise<{ version: string; assets: string[] }>;
  });
  expect(manifest.version).toMatch(/^[a-f0-9]{16}$/u);
  expect(manifest.assets).toEqual(expect.arrayContaining(['/index.html', '/offline.html', '/icon.svg', '/manifest.webmanifest']));
  expect(manifest.assets.some(asset => asset.startsWith('/assets/') && asset.endsWith('.js'))).toBe(true);
  for (const asset of manifest.assets) expect((await page.request.get(asset)).status(), asset).toBe(200);
  const caches = await cacheUrls(page);
  const shell = caches.find(entry => entry.name === `${SHELL_PREFIX}${manifest.version}`);
  expect(shell, 'current build must own a cache').toBeDefined();
  const cachedPaths = shell!.urls.map(url => new URL(url).pathname);
  for (const asset of manifest.assets) expect(cachedPaths, asset).toContain(new URL(asset, 'http://localhost').pathname);
  for (const url of caches.flatMap(entry => entry.urls.map(value => new URL(value).pathname))) {
    expect(url.startsWith('/api/'), url).toBe(false);
    expect(url === '/pilot' || url.startsWith('/pilot/'), url).toBe(false);
  }
});

test('offline public route reopens the committed demo request while the private pilot stays server-bound', async ({ page, context }) => {
  await page.goto('/request/O01');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Сохранить демозапрос', exact: true }).click();
  await expect(page).toHaveURL(/\/request-status\//u);
  const id = await page.getByTestId('request-id').innerText();
  await controlled(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('request-metadata')).toHaveAttribute('data-status', 'recorded_demo');
  await expect(page.getByTestId('request-id')).toHaveText(id);
  await expect(page.getByText('Специалисту ничего не отправлено', { exact: true })).toBeVisible();
  for (const path of ['/pilot', '/PILOT/', '/%70ilot']) {
    await page.goto(path);
    await expect(page.getByText('Приватный пилот требует соединения с сервером.', { exact: false })).toBeVisible();
    await expect(page.getByText('Офлайн-запись не выполнялась.', { exact: false })).toBeVisible();
  }
  await context.setOffline(false);
});

test('saved card keeps one row per offer and the catalog confirmation instant survives re-saving', async ({ page }) => {
  await page.goto('/specialists/S01?offer=O01');
  await page.getByRole('button', { name: 'Сохранить демокарточку офлайн', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Синтетическая карточка сохранена' })).toBeVisible();
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('qoldau.saved-demo.v1')!) as { id: string; checkedAt: string; savedAt: string; isSynthetic: boolean }[]);
  const first = (await read())[0];
  await page.clock.setFixedTime(new Date(Date.parse(first.savedAt) + 1000));
  await page.getByRole('button', { name: 'Сохранить демокарточку офлайн', exact: true }).click();
  const rows = await read();
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe('O01');
  expect(rows[0].isSynthetic).toBe(true);
  expect(rows[0].checkedAt).toBe(first.checkedAt);
  expect(rows[0].savedAt).not.toBe(first.savedAt);
});

test('corrupt saved-card storage is surfaced and never overwritten by a failed save', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qoldau.saved-demo.v1', '{corrupt'));
  await page.goto('/saved');
  await expect(page.getByRole('alert')).toHaveText('Не удалось прочитать хранилище.');
  await expect(page.getByTestId('saved-card')).toHaveCount(0);
  await page.goto('/specialists/S01?offer=O01');
  await page.getByRole('button', { name: 'Сохранить демокарточку офлайн', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Сохранить не удалось' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('qoldau.saved-demo.v1'))).toBe('{corrupt');
});
