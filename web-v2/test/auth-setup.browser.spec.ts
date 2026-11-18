import {expect, test} from '@playwright/test';

for (const width of [1280, 390]) {
  test(`auth forms keep the shared panel and fit a ${width}px viewport`, async ({page}) => {
    await page.setViewportSize({width, height: 844});
    for (const view of ['login', 'login-error', 'setup', 'join', 'device', 'consent']) {
      await page.goto(`/auth-fixture/${view}`);
      const panel = page.locator('main > .oc-auth-page');
      await expect(panel.getByRole('heading', {level: 1})).toBeVisible();
      await expect(panel).toHaveCSS('max-width', '480px');
      const bounds = await panel.boundingBox();
      expect(bounds).not.toBeNull();
      expect(Math.abs(bounds!.x * 2 + bounds!.width - width)).toBeLessThan(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test('device approval submits the code shown in the terminal', async ({page}) => {
  await page.goto('/auth-fixture/device');
  const code = page.getByLabel('Connection code');
  await expect(code).toHaveValue('TEST-1234');
  await expect(code).toHaveAttribute('readonly', '');
  await page.route('**/device', route => route.fulfill({contentType: 'text/plain', body: 'Connected'}));
  const posted = page.waitForRequest(request => new URL(request.url()).pathname === '/device');
  await page.getByRole('button', {name: 'Connect CLI', exact: true}).click();
  const fields = new URLSearchParams((await posted).postData() || '');
  expect(fields.get('user_code')).toBe('TEST-1234');
  expect(fields.get('decision')).toBe('approve');
});
