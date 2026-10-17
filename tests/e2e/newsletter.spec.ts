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
    const dialog = page.getByRole('dialog', { name: 'Subscribe to our newsletter' });
    // On a cold start, a click before React hydrates the page can be lost, so retry until the dialog opens.
    await expect(async () => {
      if (!(await dialog.isVisible())) await page.getByRole('button', { name: 'Subscribe to our newsletter' }).click();
      await expect(dialog.getByLabel('Full name')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
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
    await page.getByText('A fortnightly letter from our team, with ideas you can use between sessions.').scrollIntoViewIfNeeded();
    await page.getByLabel('Full name').fill('Asha Rao');
    await page.getByLabel('Email address').fill('asha@example.com');
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
    await expect(page.getByText(OK.message)).toBeVisible();
    expect(bodies[0]).toMatchObject({ page: '/' });
  });
});

test.describe('Confirm page', () => {
  const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456';

  test('confirms with the token from the emailed link', async ({ page }) => {
    let sent: unknown;
    await page.route('**/api/newsletter-confirm', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.goto(`/newsletter/confirm/#t=${TOKEN}`);
    await page.getByRole('button', { name: 'Confirm my subscription' }).click();
    await expect(page.getByRole('heading', { name: "You're subscribed" })).toBeVisible();
    expect(sent).toEqual({ token: TOKEN });
    await expect(page).toHaveURL(/\/newsletter\/confirm\/$/);
  });

  test('offers the form again when the link has expired or was already used', async ({ page }) => {
    await page.route('**/api/newsletter-confirm', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"expired"}' }),
    );
    await page.goto(`/newsletter/confirm/#t=${TOKEN}`);
    await page.getByRole('button', { name: 'Confirm my subscription' }).click();
    await expect(page.getByRole('heading', { name: 'This link has expired or was already used', exact: true })).toBeVisible();
    await expect(page.getByText("If you already confirmed, you're subscribed.")).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
  });

  test('is kept out of search results', async ({ page }) => {
    await page.goto('/newsletter/confirm/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

test.describe('Admin newsletter tab', () => {
  test('lists subscribers from the API', async ({ page }) => {
    // The dashboard only reads the token's expiry; the mocked API accepts anything.
    const payload = Buffer.from(
      JSON.stringify({ email: 'admin@example.com', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64');
    await page.addInitScript((token) => {
      sessionStorage.setItem('admin_token', token);
      sessionStorage.setItem('admin_email', 'admin@example.com');
    }, `e30.${payload}.signature`);
    await page.route('**/api/admin-newsletter-subscribers**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subscribers: [
            {
              id: 'a', email: 'asha@example.com', full_name: 'Asha Rao', status: 'subscribed', source: 'website',
              consent_at: '2026-10-10T06:30:00.000Z', created_at: '2026-10-10T06:00:00.000Z',
              unsubscribed_at: null, unsubscribe_source: null,
            },
          ],
          total: 1,
          counts: { pending: 0, subscribed: 1, unsubscribed: 0 },
          needs_push: 0,
          limit: 25,
          offset: 0,
        }),
      }),
    );
    await page.goto('/arel-ops/');
    await page.getByRole('button', { name: 'Newsletter' }).click();
    await page.getByRole('tab', { name: 'Subscribers' }).click();
    await expect(page.getByRole('heading', { name: 'Newsletter subscribers' })).toBeVisible();
    await expect(page.getByText('asha@example.com')).toBeVisible();
  });

  test('writes an issue with a live preview and saves it', async ({ page }) => {
    const payload = Buffer.from(
      JSON.stringify({ email: 'admin@example.com', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64');
    await page.addInitScript((token) => {
      sessionStorage.setItem('admin_token', token);
      sessionStorage.setItem('admin_email', 'admin@example.com');
    }, `e30.${payload}.signature`);
    const issue = {
      id: '11111111-1111-4111-8111-000000000001',
      subject: 'October',
      preheader: '',
      issue_date: '2026-10-14',
      title: 'Know Thyself',
      hero_image_url: null,
      hero_image_alt: '',
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello readers' }] }] },
      share_url: null,
      status: 'draft',
      last_error: null,
      resend_broadcast_id: null,
      recipient_count: null,
      sent_at: null,
      sent_by: null,
      created_by: 'admin@example.com',
      updated_by: null,
      created_at: '2026-10-14T10:00:00.000Z',
      updated_at: '2026-10-14T10:00:00.000Z',
    };
    const about = { me: 'admin@example.com', from: 'Hope Trust <newsletter@hopetrustindia.com>', subscribed: 2 };
    let saved: Record<string, unknown> | null = null;
    await page.route('**/api/admin-newsletter-issues**', async (route) => {
      const request = route.request();
      const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (request.method() === 'PATCH') {
        saved = request.postDataJSON();
        return json({ issue: { ...issue, ...saved, updated_at: '2026-10-14T10:05:00.000Z' } });
      }
      if (new URL(request.url()).searchParams.get('id')) return json({ issue, ...about });
      return json({ issues: [issue], ...about });
    });

    await page.goto('/arel-ops/');
    await page.getByRole('button', { name: 'Newsletter' }).click();
    await page.getByRole('button', { name: 'October' }).click();
    const title = page.getByLabel('Title', { exact: true });
    await expect(title).toHaveValue('Know Thyself');
    await title.fill('Know Yourself First');
    const preview = page.frameLocator('iframe[title="Email preview"]');
    await expect(preview.getByText('Know Yourself First')).toBeVisible();

    const body = page.getByRole('textbox', { name: 'Body' });
    await body.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' and friends');
    // Exact: with no preheader, the hidden inbox preview line repeats the start of the body.
    await expect(preview.getByText('Hello readers and friends', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    expect(saved).toMatchObject({ title: 'Know Yourself First', updated_at: '2026-10-14T10:00:00.000Z' });
    expect(JSON.stringify(saved)).toContain('Hello readers and friends');
  });
});
