import { expect, test } from '@playwright/test';

test('map is the same search projection and its numbered markers map to the complete list', async ({ page }) => {
  const external: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') external.push(request.url());
  });
  await page.goto('/specialists');
  const before = await page.getByTestId('search-count').innerText();
  await page.getByRole('button', { name: 'Показать схему карты', exact: true }).click();
  const points = page.locator('.map-canvas .map-point');
  const count = await points.count();
  expect(count).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'Список точек', exact: true })).toBeVisible();
  const list = page.locator('.result-map ol > li');
  await expect(list).toHaveCount(count);
  for (let index = 0; index < count; index += 1) {
    await expect(points.nth(index)).toHaveAccessibleName(new RegExp(`^Точка ${index + 1}: .+`, 'u'));
  }
  const target = await list.first().getAttribute('id');
  expect(target).toMatch(/^map-O\d+$/u);
  await points.first().click();
  await expect(page.locator(`#${target}`)).toBeFocused();
  await expect(page.getByTestId('search-count')).toHaveText(before);
  expect(external).toEqual([]);
});

test('optional geolocation denial never changes the result or removes manual search', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (_success: unknown, error: () => void) => error() },
    });
  });
  await page.goto('/specialists');
  await page.getByRole('button', { name: 'Показать схему карты', exact: true }).click();
  const before = await page.getByTestId('search-count').innerText();
  await page.getByRole('button', { name: 'Проверить доступ к геолокации', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Геолокация недоступна' })).toBeVisible();
  await expect(page.getByTestId('search-count')).toHaveText(before);
  await expect(page.getByRole('button', { name: 'Фильтры', exact: true })).toBeVisible();
});

test('map stays keyboard operable at 320, 390 and 1280 with 200% text in RU and KK', async ({ page }) => {
  await page.goto('/specialists');
  await page.getByRole('button', { name: 'Показать схему карты', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.map-canvas')).toBeVisible();
  const first = page.locator('.map-point').first();
  await first.focus(); await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.getByRole('button', { name: 'Қаз', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Сол нәтижелердің сызбасы', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Нүктелер тізімі', exact: true })).toBeVisible();
  await expect(page.locator('.map-point').first()).toHaveAccessibleName(/^Нүкте 1: /u);
});
