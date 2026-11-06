import { type Browser, devices, expect, type Page, test } from '@playwright/test';

const PHONE = { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const WIN = /\bwins?!$/;

async function openHost(browser: Browser, where: 'stream' | 'room' = 'stream') {
  const ctx = await browser.newContext({ ...devices['Desktop Chrome'] });
  const page = await ctx.newPage();
  // ?demo shows demo tones even when .env.local has a Spotify client id.
  await page.goto('./?demo#/');
  await page.getByRole('button', { name: 'Skip tutorial' }).click({ timeout: 15_000 });
  await page.getByLabel('Your name').fill('Hervé');
  await page.getByRole('button', { name: 'Create room' }).click();
  const link = (await page.getByTestId('invite-link').textContent({ timeout: 30_000 })) ?? '';
  expect(link).toMatch(/#\/join\/TUBE-[A-Z0-9]{4}$/);
  await page.getByRole('radio', { name: where === 'room' ? /In the room/ : /On everyone's phone/ }).check();
  await page.getByRole('radio', { name: 'Demo tones' }).check();
  return { page, link };
}

async function joinGuest(browser: Browser, link: string, name: string, phone: boolean) {
  const ctx = await browser.newContext(phone ? PHONE : { ...devices['Desktop Chrome'] });
  const page = await ctx.newPage();
  await page.goto(link);
  await page.getByRole('button', { name: 'Skip tutorial' }).click({ timeout: 15_000 });
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
  // Long window: the game only moves on because the other teams pass (the window closes early).
  await setNumber(host.page, 'Steal window (s)', '60');
  await host.page.getByRole('button', { name: 'Start game' }).click();

  const pages = [host.page, lea, marco];
  for (const p of pages) await expect(p.getByText('Mystery track', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => hasAudio(lea), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => hasAudio(marco), { timeout: 20_000 }).toBe(true);
  expect(await sideScroll(lea)).toBeLessThanOrEqual(0);

  await lea.getByRole('button', { name: 'Pause' }).click();
  for (const p of pages) await expect(p.getByText('Paused by Léa')).toBeVisible({ timeout: 15_000 });
  await expect(marco.getByRole('button', { name: 'Resume' })).toBeFocused();
  await marco.getByRole('button', { name: 'Resume' }).click();
  for (const p of pages) await expect(p.getByText('Paused by Léa')).toBeHidden({ timeout: 15_000 });

  let sawReveal = false;
  for (let i = 0; i < 40; i++) {
    if (await host.page.getByText(WIN).first().isVisible()) break;
    let player: Page | undefined;
    for (const p of pages) if (await p.getByRole('button', { name: 'Lock in' }).isVisible()) player = p;
    if (!player) {
      await host.page.waitForTimeout(300);
      continue;
    }
    await player.getByRole('button', { name: /^(Before|Between|After)/ }).first().click();
    await player.getByRole('button', { name: 'Lock in' }).click();
    for (const p of pages) {
      if (p === player) continue;
      const press = p.getByRole('button', { name: 'TUBESTER!' });
      await expect(press).toBeEnabled({ timeout: 15_000 });
      await press.click();
    }
    const next = host.page.getByRole('button', { name: /^(Next|New game)$/ });
    await expect(next).toBeVisible({ timeout: 15_000 });
    if ((await next.textContent()) === 'Next') {
      await expect(lea.getByText('It was', { exact: true })).toBeVisible();
      sawReveal = true;
      await next.click();
    }
  }

  for (const p of pages) await expect(p.getByRole('dialog').getByText(WIN)).toBeVisible({ timeout: 15_000 });
  await expect(lea.getByRole('button', { name: 'See the timelines' })).toBeFocused();
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

  await host.page.getByRole('button', { name: 'Pause' }).click();
  await host.page.getByRole('button', { name: 'End game' }).click();
  await expect(host.page.getByText('End the game for everyone?')).toBeVisible();
  await host.page.getByRole('button', { name: 'End game' }).click();
  for (const p of [host.page, lea]) await expect(p.getByRole('dialog').getByText(WIN)).toBeVisible({ timeout: 15_000 });
});

test('in the room: guests get no sound and see Listen to the room', async ({ browser }) => {
  const host = await openHost(browser, 'room');
  const lea = await joinGuest(browser, host.link, 'Léa', true);
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(lea.getByText('Listen to the room').first()).toBeVisible({ timeout: 15_000 });
  await expect(host.page.getByText('1 player connected')).toBeVisible();
  await expect(lea.getByRole('button', { name: 'Tap to enable sound' })).toBeHidden();
  expect(await hasAudio(lea)).toBe(false);
  expect(await sideScroll(lea)).toBeLessThanOrEqual(0);

  // One full turn: place, steal or pass, reveal, next.
  const pages = [host.page, lea];
  let player: Page | undefined;
  await expect
    .poll(async () => {
      for (const p of pages) if (await p.getByRole('button', { name: 'Lock in' }).isVisible()) player = p;
      return player !== undefined;
    }, { timeout: 30_000 })
    .toBe(true);
  if (!player) throw new Error('no active player');
  await player.getByRole('button', { name: /^(Before|Between|After)/ }).first().click();
  await player.getByRole('button', { name: 'Lock in' }).click();
  const other = player === lea ? host.page : lea;
  const press = other.getByRole('button', { name: 'TUBESTER!' });
  await expect(press).toBeEnabled({ timeout: 15_000 });
  await press.click();
  await expect(lea.getByText('It was', { exact: true })).toBeVisible({ timeout: 15_000 });
  await host.page.getByRole('button', { name: 'Next' }).click();
  await expect(lea.getByText('Listen to the room').first()).toBeVisible({ timeout: 15_000 });
  expect(await hasAudio(lea)).toBe(false);
});

test('the participant tutorial shows once, can be skipped and reopened', async ({ browser }) => {
  const host = await openHost(browser);
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await page.goto(host.link);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Listen to the song')).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole('button', { name: 'Next' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.getByText('Your turn: when was it released?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Skip tutorial' }).click();
  await expect(dialog).toBeHidden();
  expect(await sideScroll(page)).toBeLessThanOrEqual(0);

  await page.reload();
  await expect(page.getByLabel('Your name')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(6000); // past the splash: no tutorial this time
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog').getByText('Listen to the song')).toBeVisible();
});

test("the host tutorial hands over to the players' tutorial from its first step", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['Desktop Chrome'] });
  const page = await ctx.newPage();
  await page.goto('./#/');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Host from any device')).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 5; i++) await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: "See the players' tutorial" }).click();
  await expect(dialog.getByText('Listen to the song')).toBeVisible();
  await dialog.getByRole('button', { name: 'Skip tutorial' }).click();

  await page.reload();
  await expect(page.getByLabel('Your name')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'How to play' }).waitFor();
  await page.waitForTimeout(6000); // past the splash: neither tutorial comes back
  await expect(page.getByRole('dialog')).toBeHidden();
});
