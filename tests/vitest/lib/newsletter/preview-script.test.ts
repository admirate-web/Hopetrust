// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// scripts/newsletter-preview.mts runs lib/newsletter/render.ts and
// sample-issue.ts with Node alone (type stripping, no bundler), so they must
// keep type-only imports. Running the real script keeps it that way.
describe('scripts/newsletter-preview.mts', () => {
  it('renders the sample issue with Node alone', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'newsletter-preview-'));
    try {
      const run = spawnSync(process.execPath, [path.resolve('scripts/newsletter-preview.mts')], {
        cwd: dir,
        env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' },
        encoding: 'utf8',
        timeout: 30_000,
      });
      expect(run.status, run.stderr).toBe(0);
      const html = readFileSync(path.join(dir, '.newsletter-preview', 'sample-send.html'), 'utf8');
      expect(html).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 40_000);
});
