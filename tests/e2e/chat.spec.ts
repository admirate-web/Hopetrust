import { test, expect } from '@playwright/test';

// The proxy is stubbed: this proves the bubble is mounted, opens, sends and
// renders what comes back. Whether the engine behind it answers correctly is
// the CRM repo's suite, and its own operator checklist.
const REPLY = {
  reply: 'Hi there.',
  links: [],
  therapists: [],
  allTherapistsUrl: null,
  state: {}
};

function stubChat(page: import('@playwright/test').Page, body: unknown = REPLY, status = 200) {
  return page.route('**/api/chat', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  );
}

test('the bubble opens and answers', async ({ page }) => {
  await stubChat(page);

  await page.goto('/');
  await page.getByRole('button', { name: /chat/i }).click();
  // The page has textboxes of its own, such as the newsletter form's.
  const chat = page.getByRole('dialog', { name: 'Chat with the Hope Trust AI Assistant' });
  await chat.getByRole('textbox').fill('hello');
  await chat.getByRole('textbox').press('Enter');
  await expect(page.getByText('Hi there.').first()).toBeVisible();
});

// It has to be on every route, including blog posts — that is where someone
// reading about their own problem is most likely to want to ask something.
test('the bubble is on a blog post too', async ({ page }) => {
  await stubChat(page);

  await page.goto('/blogs/');
  await expect(page.getByRole('button', { name: /chat/i })).toBeVisible();
});

// Viewport rather than the mobile project: the iPhone descriptor needs WebKit,
// which is not always installed, and the thing worth proving here is that the
// panel fits a narrow screen instead of running off it.
test('the panel fits a phone-width screen', async ({ page }) => {
  await stubChat(page);
  await page.setViewportSize({ width: 375, height: 667 });

  await page.goto('/');
  await page.getByRole('button', { name: /chat/i }).click();

  const panel = page.getByRole('log');
  await expect(panel).toBeVisible();

  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});

test('a failed turn still offers a way through', async ({ page }) => {
  await stubChat(page, { error: 'CRM request failed' }, 502);

  await page.goto('/');
  await page.getByRole('button', { name: /chat/i }).click();
  await expect(page.getByRole('link', { name: /WhatsApp/i }).first()).toBeVisible();
});
