// Uploads assets/newsletter/* to the newsletter-images bucket under static/.
//
//   node --env-file=.env scripts/newsletter-upload-assets.mts
//
// File names carry a version (logo-v1.png). Change the name when an image
// changes, because email clients and Gmail's image proxy cache aggressively.

import { readdirSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (run with node --env-file=.env).');
  process.exit(1);
}

const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const supabase = createClient(url, serviceKey);
const dir = new URL('../assets/newsletter/', import.meta.url);
let failures = 0;

for (const name of readdirSync(dir).sort()) {
  const contentType = TYPES[extname(name).toLowerCase()];
  if (!contentType) continue;
  const { error } = await supabase.storage
    .from('newsletter-images')
    .upload(`static/${name}`, readFileSync(new URL(name, dir)), {
      contentType,
      cacheControl: '31536000',
      upsert: true,
    });
  if (error) failures += 1;
  console.log(error ? `FAILED static/${name}: ${error.message}` : `uploaded static/${name}`);
}

process.exit(failures ? 1 : 0);
