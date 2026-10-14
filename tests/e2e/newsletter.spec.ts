import { test, expect, type Page } from '@playwright/test';

// The /api routes are Netlify functions, which `next dev` doesn't serve, so
// every API call here is answered by the test.
const OK = { ok: true, message: 'Check your inbox to confirm your subscription.' };

async function answerSignups(page: Page) {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/newsletter-subscribe', async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OK) });
  });
  return bodies;
}

test.describe('Newsletter sign-up', () => {
  test('from the footer dialog', async ({ page }) => {
    const bodies = await answerSignups(page);
    await page.goto('/contact/');
    await page.getByRole('button', { name: 'Subscribe to our newsletter' }).click();
    const dialog = page.getByRole('dialog', { name: 'Subscribe to our newsletter' });
    await dialog.getByLabel('Full name').fill('Asha Rao');
    await dialog.getByLabel('Email address').fill('asha@example.com');
    await dialog.getByRole('button', { name: 'Subscribe' }).click();
    await expect(dialog.getByText(OK.message)).toBeVisible();
    expect(bodies[0]).toMatchObject({ full_name: 'Asha Rao', email: 'asha@example.com', page: '/contact/', notice: '2026-10' });
  });

  test('from the blog listing', async ({ page }) => {
    const bodies = await answerSignups(page);
    await page.goto('/blogs/');
    await page.getByLabel('Full name').fill('Asha Rao');
    await page.getByLabel('Email address').fill('asha@example.com');
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
    await expect(page.getByText(OK.message)).toBeVisible();
    expect(bodies[0]).toMatchObject({ page: '/blogs/' });
  });

  test('from the homepage card', async ({ page }) => {
    const bodies = await answerSignups(page);
    await page.goto('/');
    await page.getByText('A monthly letter from our team, with ideas you can use between sessions.').scrollIntoViewIfNeeded();
    await page.getByLabel('Full name').fill('Asha Rao');
    await page.getByLabel('Email address').fill('asha@example.com');
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
    await expect(page.getByText(OK.message)).toBeVisible();
    expect(bodies[0]).toMatchObject({ page: '/' });
  });
});
