import { type Browser, devices, expect, type Page, test } from '@playwright/test';

const PHONE = { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const WIN = /\bwins?!$/;

async function openHost(browser: Browser) {
  const ctx = await browser.newContext({ ...devices['Desktop Chrome'] });
  const page = await ctx.newPage();
  await page.goto('./#/');
  await page.getByLabel('Your name').fill('Hervé');
  await page.getByRole('button', { name: 'Create room' }).click();
  const link = (await page.getByTestId('invite-link').textContent({ timeout: 30_000 })) ?? '';
  expect(link).toMatch(/#\/join\/TUBE-[A-Z0-9]{4}$/);
  return { page, link };
}

async function joinGuest(browser: Browser, link: string, name: string, phone: boolean) {
  const ctx = await browser.newContext(phone ? PHONE : { ...devices['Desktop Chrome'] });
  const page = await ctx.newPage();
  await page.goto(link);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page.getByText("You're in!")).toBeVisible({ timeout: 30_000 });
  return page;
}

const hasAudio = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector('audio')?.srcObject;
    return s instanceof MediaStream && s.getAudioTracks().length > 0;
  });

const sideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function setNumber(page: Page, label: string, value: string) {
  const input = page.getByLabel(label);
  await input.fill(value);
  await input.press('Tab');
  await expect(page.getByLabel(label)).toHaveValue(value);
}

test('three players play a short game to the end', async ({ browser }) => {
  const host = await openHost(browser);
  const lea = await joinGuest(browser, host.link, 'Léa', true);
  const marco = await joinGuest(browser, host.link, 'Marco', false);
  await expect(host.page.getByLabel('Team for Marco')).toBeVisible();
  await setNumber(host.page, 'Cards to win', '2');
  await setNumber(host.page, 'Steal window (s)', '2');
  await host.page.getByRole('button', { name: 'Start game' }).click();

  const pages = [host.page, lea, marco];
  for (const p of pages) await expect(p.getByText('Mystery track', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => hasAudio(lea), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => hasAudio(marco), { timeout: 20_000 }).toBe(true);
  expect(await sideScroll(lea)).toBeLessThanOrEqual(0);

  let sawReveal = false;
  for (let i = 0; i < 40; i++) {
    if (await host.page.getByText(WIN).isVisible()) break;
    let player: Page | undefined;
    for (const p of pages) if (await p.getByRole('button', { name: 'Lock in' }).isVisible()) player = p;
    if (!player) {
      await host.page.waitForTimeout(300);
      continue;
    }
    await player.getByRole('button', { name: /^(Before|Between|After)/ }).first().click();
    await player.getByRole('button', { name: 'Lock in' }).click();
    const next = host.page.getByRole('button', { name: /^(Next|New game)$/ });
    await expect(next).toBeVisible({ timeout: 15_000 });
    if ((await next.textContent()) === 'Next') {
      await expect(lea.getByText('It was', { exact: true })).toBeVisible();
      sawReveal = true;
      await next.click();
    }
  }

  for (const p of pages) await expect(p.getByText(WIN)).toBeVisible({ timeout: 15_000 });
  expect(await sideScroll(lea)).toBeLessThanOrEqual(0);
  expect(sawReveal || (await lea.getByText('It was', { exact: true }).isVisible())).toBe(true);
});

test('a guest gets the game back after the host reloads', async ({ browser }) => {
  const host = await openHost(browser);
  const lea = await joinGuest(browser, host.link, 'Léa', true);
  const cards = host.page.getByLabel('Cards to win');
  await cards.fill('');
  await cards.press('Tab');
  await expect(host.page.getByLabel('Cards to win')).toHaveValue('10');
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(lea.getByText('Mystery track', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  const scores = await lea.locator('.scores').textContent();

  await host.page.reload();

  await expect(host.page.getByText('Broadcasting to 1 player')).toBeVisible({ timeout: 60_000 });
  await expect(lea.getByText('Reconnecting…')).toBeHidden({ timeout: 60_000 });
  await expect(lea.locator('.scores')).toHaveText(scores ?? '');
  await expect.poll(() => hasAudio(lea), { timeout: 30_000 }).toBe(true);
});
