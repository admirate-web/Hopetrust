# Hope Trust India — Complete Project Documentation

## Project Overview

**Hope Trust India** (`hopetrustindia.com`) is a mental health and addiction recovery clinic website based in Banjara Hills, Hyderabad, India. Founded in 2002, the organization offers therapy, psychiatry, couples/family therapy, addiction recovery, and wellness coaching services.

This is a **statically exported Next.js 15 application** hosted on **Netlify**, with **Supabase** as the backend (PostgreSQL database + file storage) and **Resend** for transactional emails.

---

## Disabled Features (as of May 2026)

The following features are **temporarily disabled** and commented out in the codebase. All original code is preserved in comments (marked `PAYMENT DISABLED` or `WHATSAPP CRM DISABLED`) and in git history for future re-enablement.

### Payment / Enrollment (Razorpay)
- **Enroll buttons** on `/training` and `/addiction` pages — commented out
- **`EnrollmentModal`** import and usage — commented out on both pages
- **Enrollments tab** in admin dashboard (`/admin`) — import, tab button, and tab content all commented out; `activeTab` type narrowed to `'addiction' | 'training'`
- **`/enrollment-success`** page — replaced with a redirect to `/`; original page content available in git history
- **`netlify.toml` redirects** — `/api/create-order`, `/api/razorpay-webhook`, `/api/enrollment-status`, `/api/admin-enrollments` all commented out
- **`netlify.toml` Permissions-Policy** — Razorpay removed from `payment=()` directive
- **`public/_headers` CSP** — Razorpay domains (`checkout.razorpay.com`, `api.razorpay.com`, `lumberjack.razorpay.com`) removed from `script-src`, `connect-src`, and `frame-src`

**Not removed** (standalone, untouched):
- All Netlify Functions (`create-order.mjs`, `razorpay-webhook.mjs`, `enrollment-status.mjs`, `admin-enrollments.mjs`)
- All lib modules (`lib/enrollment.ts`, `lib/enrollments-admin.ts`)
- Components (`components/EnrollmentModal.tsx`, `components/admin/EnrollmentsTab.tsx`)
- Database tables and RLS policies

### WhatsApp CRM
- **`WhatsAppButton`** floating icon — component now returns `null`; import and usage commented out in `app/layout.tsx`
- **`lib/config.ts`** — `whatsappNumber` variable and `whatsappUrl` config property commented out
- **`netlify/functions/whatsapp-crm.mjs`** — full handler commented out; replaced with a 503 stub so Netlify deploys cleanly (path `/api/whatsapp-crm` still registered)
- **`tests/vitest/lib/config.test.ts`** — WhatsApp URL test commented out

**Not removed** (standalone, untouched):
- `components/WhatsAppButton.tsx` — full original implementation preserved as line comments
- `RectangleSection.tsx` and `app/about/page.tsx` — user-facing copy mentioning "WhatsApp" (informational text, not CRM integration)

### Website Chat Bubble (as of August 2026)
- **`<ChatBubble />`** — import and usage commented out in `app/layout.tsx`. This is the only thing keeping the widget off the site; the build tree-shakes the component and its chunk out of the bundle entirely.
- **`tests/e2e/chat.spec.ts`** — suite skipped via `test.skip(() => true, …)` at the top of the file, since every assertion expects a mounted widget

**Not removed** (standalone, untouched):
- `components/ChatBubble.tsx` — full implementation
- `netlify/functions/whatsapp-crm.mjs` — the proxy handler is still live
- `netlify.toml` — the `/api/chat` → `whatsapp-crm` redirect is still registered
- `tests/vitest/components/chat-bubble.test.tsx` and `tests/vitest/functions/chat-proxy.test.ts` — these exercise the component and the proxy in isolation, so they still pass

> **Note:** `POST /api/chat` remains publicly reachable and still forwards to the CRM webhook. Nothing on the site calls it, but it is not closed. If the bubble is staying off for a while, comment out the `/api/chat` redirect in `netlify.toml` too.

### How to re-enable
1. Search for `PAYMENT DISABLED`, `WHATSAPP CRM DISABLED`, and `CHAT BUBBLE DISABLED` across the codebase
2. Uncomment the marked blocks
3. Restore the original `public/_headers` CSP and `netlify.toml` redirects + Permissions-Policy
4. Restore `app/enrollment-success/page.tsx` from git history
5. For WhatsApp: set `CRM_ENDPOINT` and `WHATSAPP_CRM_TOKEN` env vars for the new CRM provider
6. Verify build with `npx tsc --noEmit && npm run build`

---

## Newsletter (October 2026)

Staff write and send a monthly email newsletter from the **Newsletter** tab in `/arel-ops`. The design is in `docs/superpowers/specs/2026-10-13-newsletter-design.md`, and the plans that built it are in `docs/superpowers/plans/`.

- **Sign-up:** `components/NewsletterForm.tsx` sits in the footer dialog, on the blog listing and in the homepage card. People confirm by email, through `/newsletter/confirm/`.
- **Functions:** these are TypeScript `.mts` files in `netlify/functions/`: `newsletter-subscribe`, `newsletter-confirm`, `admin-newsletter-subscribers`, `admin-newsletter-issues`, and the hourly `newsletter-cleanup`. The shared code is in `netlify/functions/_shared/newsletter-*.mts`. Its services come in through `newsletter-deps.mts`, so the tests use in-memory versions (`tests/vitest/functions/newsletter/fakes.ts`).
- **The email:** `lib/newsletter/render.ts` builds the HTML for the editor's preview, the test send and the broadcast. `node --env-file=.env scripts/newsletter-preview.mts` renders the sample issue, and `--send you@example.com` emails it as a test.
- **Data:** `Database/newsletter.sql` holds subscribers, erased addresses, sign-up requests and issues; `Database/newsletter-storage.sql` holds the `newsletter-images` bucket. Apply SQL changes in the Supabase SQL editor.
- **Resend:** it needs a Full access key (`RESEND_API_KEY`), the "Newsletter" segment (`RESEND_NEWSLETTER_SEGMENT_ID`) and `NEWSLETTER_FROM_EMAIL`. Supabase is the record of consent. Resend holds a copy of the subscribed contacts, sends the broadcasts and hosts the unsubscribe page.
- **Admin sign-in:** `node --env-file=.env scripts/seed-admin.mjs <email> <password>` creates an admin, or resets an admin's password.

---

## Tech Stack

| Layer            | Technology                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| **Framework**    | Next.js 15 (App Router) — `output: 'export'` (fully static site generation) |
| **Language**     | TypeScript 5.2                                                             |
| **Styling**      | TailwindCSS 3.3 + shadcn/ui (47 Radix-based UI primitives) + tailwindcss-animate |
| **Animation**    | Framer Motion (via `motion` package v11), Lenis smooth scroll, Three.js / OGL for 3D effects |
| **Database**     | Supabase (PostgreSQL) — anonymous client via `@supabase/supabase-js` v2   |
| **Email**        | Resend REST API (newsletter broadcasts, confirmation, enrollment and test emails) |
| **Validation**   | Zod v3 + react-hook-form v7                                               |
| **Blog/CMS**     | ~395 MDX files in `content/blogs/` (migrated from WordPress), parsed with `gray-matter` + `marked` |
| **Hosting**      | Netlify (static export + Netlify Functions + Netlify Forms)                |
| **Testing**      | Vitest 4 + @testing-library/react + jsdom                                 |
| **Icons**        | Lucide React                                                               |
| **Notifications**| Sonner (toast notifications)                                               |

---

## Directory Structure

```
Hopetrust/
├── app/                        # Next.js App Router pages
│   ├── layout.tsx              # Root layout (Inter font, Lenis, Toaster; WhatsApp button disabled)
│   ├── page.tsx                # Homepage (10 code-split sections)
│   ├── about/page.tsx          # About page (story, team, typewriter, wellness)
│   ├── addiction/page.tsx      # Addiction recovery (5-step road)
│   ├── admin/page.tsx          # Admin dashboard (JWT auth + program CRUD)
│   ├── blogs/
│   │   ├── page.tsx            # Blog listing (server component)
│   │   └── [slug]/page.tsx     # Blog detail (SSG, markdown, JSON-LD)
│   ├── book-your-session/page.tsx  # Doctor directory (Supabase-powered)
│   ├── contact/page.tsx        # Contact form (Zod + Supabase + Netlify Forms)
│   ├── corporate-wellness/page.tsx  # Corporate wellness (parallax hero, cards, video bg)
│   ├── intervention-services/page.tsx  # Intervention services (parallax, video, sections)
│   ├── mental-health/page.tsx  # Mental health services (tabs UI)
│   ├── sitemap/page.tsx        # Human-readable sitemap page
│   ├── training/page.tsx       # Training programs (dynamic from Supabase, responsive)
│   ├── error.tsx               # Global error boundary
│   ├── not-found.tsx           # Custom 404 page
│   ├── globals.css             # Global styles
│   └── __tests__/              # App-level tests (contact.test.tsx)
│
├── components/                 # React components
│   ├── ui/                     # 47 shadcn/ui components (Button, Dialog, Tabs, etc.)
│   ├── Header.tsx              # Site header / navigation
│   ├── Footer.tsx              # Site footer
│   ├── JsonLd.tsx              # JSON-LD structured data script injector
│   ├── HeroSection.tsx         # Homepage hero
│   ├── BlogListClient.tsx      # Blog listing with filtering/pagination (~16KB)
│   ├── TherapistCard.tsx       # Doctor/therapist card component
│   ├── NewsletterForm.tsx      # Newsletter signup (inline + card variants)
│   ├── admin/newsletter/       # Newsletter tab: issues, editor, preview, subscribers
│   ├── WhatsAppButton.tsx      # Floating WhatsApp button (disabled — returns null)
│   ├── ContactSection.tsx      # Homepage contact section
│   ├── FadeInSection.tsx       # Scroll-triggered fade-in wrapper
│   ├── AuroraBackground.tsx    # Animated aurora background effect
│   ├── ProximityText.tsx       # Mouse-proximity text effect
│   ├── VariableProximity.tsx   # Variable font proximity animation
│   ├── TiltedCard.tsx          # 3D tilt card effect
│   ├── MagicText.tsx           # Animated text component
│   ├── ReviewsSection.tsx      # Client testimonials carousel
│   ├── ServicesSection.tsx     # Services overview
│   ├── OurTeamSection.tsx      # Team members section
│   ├── MeetTheTeamSection.tsx  # Homepage team preview
│   ├── WebVitals.tsx           # Web Vitals performance reporter
│   ├── LenisProvider.tsx       # Lenis smooth scroll provider
│   └── __tests__/              # Component tests
│
├── lib/                        # Shared utilities and services
│   ├── supabase.ts             # Supabase client singleton (anon key)
│   ├── doctors.ts              # fetchDoctors(), fetchDepartments()
│   ├── programs.ts             # Addiction program CRUD via Netlify fn + UnauthorizedError class
│   ├── training-programs.ts    # Training program CRUD via Netlify fn (typed interfaces)
│   ├── blog.ts                 # Blog MDX reading (getAllPosts, getPostBySlug, etc.)
│   ├── config.ts               # Site config (name, contact info, maps URL)
│   ├── assets.ts               # getAssetUrl() + getStorageUrl() — Supabase storage URL builders
│   ├── jsonld.ts               # JSON-LD structured data schema generators (Organization, Service, Breadcrumb, FAQ)
│   ├── enrollment.ts           # Razorpay client API + checkout loader (sends Idempotency-Key)
│   ├── enrollments-admin.ts    # Admin enrollments API wrapper
│   ├── newsletter/             # Newsletter: issue rules, renderer, sign-up rules, import
│   ├── utils.ts                # cn() — Tailwind class merger
│   ├── assets.test.ts          # Asset utility tests
│   └── utils.test.ts           # Utils tests
│
├── hooks/                      # Custom React hooks
│   └── useScrollAnimation.ts   # IntersectionObserver scroll animations + animation presets
│
├── content/
│   └── blogs/                  # ~395 MDX blog posts (migrated from WordPress)
│
├── Database/                   # SQL migration scripts
│   ├── supabase-setup.sql      # Initial tables (contact, joinus, newsletter, storage)
│   ├── doctors-table.sql       # Doctors table + seed data (12 doctors)
│   ├── admin-schema.sql        # admin_users + addiction_programs tables + seed data
│   ├── admin-security.sql      # Safe migration: adds failed_attempts + locked_until to admin_users
│   ├── admin-audit-log.sql     # Audit log table + RLS (service_role write-only)
│   ├── training-programs.sql   # Training programs table + RLS + seed data
│   └── rls-policies.sql        # Row Level Security policies
│
├── netlify/
│   └── functions/
│       ├── _shared/
│       │   ├── razorpay.mjs    # Razorpay REST helpers + signature verification
│       │   └── emails.mjs      # Branded email templates + Resend wrapper
│       ├── admin-login.mjs     # Netlify Function: admin JWT auth
│       ├── admin-programs.mjs  # Netlify Function: addiction programs CRUD
│       ├── admin-training-programs.mjs  # Netlify Function: training programs CRUD
│       ├── admin-enrollments.mjs  # Netlify Function: enrollment list/CSV/PATCH (JWT-gated)
│       ├── create-order.mjs    # Netlify Function: Razorpay order + enrollment (rate-limited)
│       ├── razorpay-webhook.mjs  # Netlify Function: payment webhook (HMAC-verified)
│       ├── enrollment-status.mjs  # Netlify Function: enrollment polling (UUID-gated)
│       └── whatsapp-crm.mjs    # Netlify Function: WhatsApp CRM proxy (disabled — 503 stub)
│
├── scripts/
│   ├── generate-sitemap.mjs    # Post-build sitemap.xml + robots.txt
│   ├── seed-admin.mjs          # CLI: create/update admin user with bcrypt hash
│   └── migrate-wp.mjs          # WordPress → MDX migration tool
│
├── public/                     # Static public assets
├── netlify.toml                # Netlify config (build, redirects, headers, caching)
├── next.config.js              # Next.js config (static export, image optimization)
├── tailwind.config.ts          # Tailwind theme config
├── tsconfig.json               # TypeScript config
├── vitest.config.ts            # Vitest test config
├── vitest.setup.ts             # Vitest setup (testing-library matchers)
├── package.json                # Dependencies and scripts
└── .env                        # Environment variables (gitignored)
```

---

## Database Schema (Supabase PostgreSQL)

### Table: `contact_submissions`

Stores contact form submissions from the `/contact` page.

| Column       | Type         | Constraints                    |
| ------------ | ------------ | ------------------------------ |
| `id`         | uuid (PK)    | `DEFAULT gen_random_uuid()`    |
| `full_name`  | text         | NOT NULL, 2–200 chars          |
| `phone`      | text         | NOT NULL, 7–20 chars           |
| `email`      | text         | NOT NULL, regex validated       |
| `message`    | text         | NOT NULL, 5–5000 chars         |
| `created_at` | timestamptz  | `DEFAULT now()`                |

**RLS Policies:**
- `anon` role: INSERT only (with field length + format validation in policy `WITH CHECK`)
- `anon` role: SELECT, UPDATE, DELETE explicitly denied
- Data is only accessible via Supabase Dashboard or service_role key

### Table: `joinus_applications`

Stores job applications (form accessible via public forms HTML — route removed from app).

| Column         | Type         | Constraints                    |
| -------------- | ------------ | ------------------------------ |
| `id`           | uuid (PK)    | `DEFAULT gen_random_uuid()`    |
| `full_name`    | text         | NOT NULL, 2–200 chars          |
| `email`        | text         | NOT NULL, regex validated       |
| `position`     | text         | NOT NULL, 2–200 chars          |
| `cv_link`      | text         | NOT NULL, must be `https?://`  |
| `introduction` | text         | NOT NULL, 10–5000 chars        |
| `created_at`   | timestamptz  | `DEFAULT now()`                |

**RLS Policies:**
- `anon` role: INSERT only (with validation)
- `anon` role: SELECT, UPDATE, DELETE explicitly denied

### Table: `newsletter_subscribers`

Stores newsletter signups from `NewsletterForm` component (used across multiple pages).

| Column          | Type         | Constraints                    |
| --------------- | ------------ | ------------------------------ |
| `id`            | uuid (PK)    | `DEFAULT gen_random_uuid()`    |
| `full_name`     | text         | NOT NULL, 2–200 chars          |
| `email`         | text         | NOT NULL, **UNIQUE**, regex validated |
| `phone`         | text         | NOT NULL, 7–20 chars           |
| `subscribed_at` | timestamptz  | `DEFAULT now()`                |
| `is_active`     | boolean      | `DEFAULT true`                 |

**RLS Policies:**
- `anon` role: INSERT only (with validation)
- `anon` role: SELECT, UPDATE, DELETE explicitly denied
- Duplicate email insert returns error code `23505`

### Table: `doctors`

Stores the therapist/doctor directory displayed on `/book-your-session`.

| Column          | Type         | Constraints                         |
| --------------- | ------------ | ----------------------------------- |
| `id`            | uuid (PK)    | `DEFAULT gen_random_uuid()`         |
| `name`          | text         | NOT NULL                            |
| `qualification` | text         | NOT NULL                            |
| `department`    | text         | NOT NULL (Psychology/Psychiatry/Social Work) |
| `bio`           | text         | NOT NULL, DEFAULT ''                |
| `booking_url`   | text         | NOT NULL, DEFAULT '' (MeetMyDoctor links) |
| `photo`         | text         | nullable                            |
| `is_active`     | boolean      | NOT NULL, DEFAULT true              |
| `display_order` | integer      | NOT NULL, DEFAULT 0                 |
| `created_at`    | timestamptz  | NOT NULL, DEFAULT now()             |
| `updated_at`    | timestamptz  | NOT NULL, DEFAULT now() (auto-updated via trigger) |

**Trigger:** `doctors_updated_at` — auto-sets `updated_at = now()` on row update.
**Index:** `idx_doctors_active_order` on `(is_active, display_order)`.

**RLS Policies:**
- `anon` role: SELECT only where `is_active = true` (public doctor directory)
- `anon` role: INSERT, UPDATE, DELETE explicitly denied
- `service_role`: Full access (for dashboard management)

**Seed Data:** 12 doctors pre-loaded (Mrs. Rajeshwari Luther, Dr. Vidhya Sagar, Ms. Muskan Gupta, Ms. Akansha Kabra, Ms. Sneha Sesha, Ms. Arani Shankar, Dr. Nishanth Vemana, Dr. K. Aparna, Dr. Justina Wilma Fernandes, Ms. Purvi Maski, Ms. Apeksha, Ms. Shruti Sharma).

### Table: `admin_users`

Stores admin login credentials. **No public access** — all RLS policies deny anonymous queries.

| Column          | Type         | Constraints                         |
| --------------- | ------------ | ----------------------------------- |
| `id`              | uuid (PK)    | `DEFAULT gen_random_uuid()`                    |
| `email`           | text         | NOT NULL, UNIQUE                               |
| `password_hash`   | text         | NOT NULL (bcrypt hash, cost 12)                |
| `failed_attempts` | integer      | NOT NULL, DEFAULT 0 (reset on successful login)|
| `locked_until`    | timestamptz  | nullable — when set and > now(), account locked |
| `created_at`      | timestamptz  | NOT NULL, DEFAULT now()                        |
| `updated_at`      | timestamptz  | NOT NULL, DEFAULT now() (auto-trigger)         |

**RLS Policies:** All operations (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) explicitly denied for `anon` and `authenticated` roles. Only `service_role` (Netlify function) can query.

**Seeded via:** `scripts/seed-admin.mjs` CLI script (bcrypt rounds = 12).

**Migration:** `Database/admin-security.sql` adds `failed_attempts` and `locked_until` using `ADD COLUMN IF NOT EXISTS` — safe to run on live table, zero data loss.

### Table: `addiction_programs`

Stores addiction recovery program details displayed on the `/addiction` page.

| Column        | Type         | Constraints                         |
| ------------- | ------------ | ----------------------------------- |
| `id`          | uuid (PK)    | `DEFAULT gen_random_uuid()`         |
| `name`        | text         | NOT NULL                            |
| `description` | text         | NOT NULL, DEFAULT ''                |
| `duration`    | text         | NOT NULL, DEFAULT ''                |
| `features`    | text[]       | NOT NULL, DEFAULT '{}'              |
| `is_active`   | boolean      | NOT NULL, DEFAULT true              |
| `created_at`  | timestamptz  | NOT NULL, DEFAULT now()             |
| `updated_at`  | timestamptz  | NOT NULL, DEFAULT now() (auto-trigger) |

**RLS Policies:**
- `anon` role: SELECT only where `is_active = true`
- Write operations require valid admin JWT via `admin-programs` Netlify function

**Seed Data:** 4 initial programs (Inpatient Rehabilitation, Outpatient Program, Family Therapy, Aftercare Support).

### Table: `training_programs`

Stores training program details displayed on the `/training` page. Managed via admin dashboard.

| Column          | Type         | Constraints                         |
| --------------- | ------------ | ----------------------------------- |
| `id`            | uuid (PK)    | `DEFAULT gen_random_uuid()`         |
| `category`      | text         | NOT NULL, DEFAULT 'internship' ('internship' or 'traineeship') |
| `title`         | text         | NOT NULL                            |
| `description`   | text         | NOT NULL, DEFAULT ''                |
| `levels`        | jsonb        | DEFAULT '[]' — array of `{ label, hours, price }` objects |
| `duration`      | text         | DEFAULT ''                          |
| `fee`           | text         | DEFAULT ''                          |
| `format`        | text         | DEFAULT '' (e.g. 'Online and on site') |
| `display_order` | integer      | DEFAULT 0                           |
| `is_active`     | boolean      | DEFAULT true                        |
| `created_at`    | timestamptz  | DEFAULT now()                       |
| `updated_at`    | timestamptz  | DEFAULT now()                       |

**RLS Policies:**
- `anon` role: SELECT only where `is_active = true`
- Write operations require valid admin JWT via `admin-training-programs` Netlify function

### Table: `admin_audit_log`

Immutable append-only log of all admin actions. Written server-side only by `admin-login.mjs` and `admin-programs.mjs` using the service role key.

| Column          | Type         | Constraints                                      |
| --------------- | ------------ | ------------------------------------------------ |
| `id`            | uuid (PK)    | `DEFAULT gen_random_uuid()`                      |
| `action`        | text         | NOT NULL — see action enum below                 |
| `actor_email`   | text         | nullable (null only for unauthenticated failures)|
| `resource_type` | text         | `'program'` or `'session'`                       |
| `resource_id`   | text         | UUID of affected program, or null for sessions   |
| `metadata`      | jsonb        | NOT NULL, DEFAULT `'{}'`                         |
| `ip_address`    | text         | nullable — from `x-forwarded-for` header         |
| `created_at`    | timestamptz  | NOT NULL, DEFAULT now()                          |

**Action values:**
- Session: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGIN_BLOCKED`
- Programs: `CREATE`, `UPDATE`, `DELETE`

**RLS Policies:** `FOR ALL` denied to both `anon` and `authenticated` — only `service_role` can insert/select.

**Indexes:** `created_at DESC`, `actor_email`, `action`

---

### Storage Buckets

| Bucket              | Access  | Purpose                                      |
| ------------------- | ------- | -------------------------------------------- |
| `cv-uploads`        | Public  | Job applicant CV/portfolio files (PDF, DOCX) |
| `hopetrust assets`  | Public  | Static assets (logo, images, GIFs, illustrations) |

---

## API & Serverless Functions

### 1. Netlify Function: `admin-login`

- **File:** `netlify/functions/admin-login.mjs`
- **Endpoint:** `POST /.netlify/functions/admin-login`
- **Purpose:** Authenticates admin users and issues a JWT session token.
- **Dependencies:** `@supabase/supabase-js`, `bcryptjs`, `jsonwebtoken`
- **Auth:** Uses `SUPABASE_SERVICE_ROLE_KEY` to query `admin_users` (bypasses RLS)
- **Rate Limiting:** 5 failed attempts → 15-minute lockout stored in `admin_users.locked_until`. Lockout window resets after expiry (fresh 5 attempts). Returns HTTP 429 with `Retry-After` header and `retryAfter` seconds in JSON body.
- **Flow:**
  1. Content-Type and input length validated (email ≤ 200, password ≤ 128 chars)
  2. Fetches `id, email, password_hash, failed_attempts, locked_until` from `admin_users`
  3. If `locked_until > now()`: returns 429 with remaining time
  4. If lockout expired: treats `failed_attempts` as 0 (fresh window)
  5. `bcrypt.compare` against stored hash
  6. On failure: increments `failed_attempts`; on 5th failure sets `locked_until = now() + 15m`
  7. On success: resets `failed_attempts = 0, locked_until = null`; issues 24h JWT
- **Audit Log:** Writes to `admin_audit_log` at every auth decision point:
  - `LOGIN_BLOCKED` — attempt while account still locked
  - `LOGIN_FAILED` — wrong password (not yet at lockout threshold)
  - `ACCOUNT_LOCKED` — 5th failed attempt triggers lockout
  - `LOGIN_SUCCESS` — successful authentication
- **Error Handling:** Generic `"Invalid credentials"` message for all failures — never reveals email existence or remaining attempt count. Attempt details are logged server-side in audit log only

### 2. Netlify Function: `admin-programs`

- **File:** `netlify/functions/admin-programs.mjs`
- **Endpoint:** `GET/POST/PUT/DELETE /.netlify/functions/admin-programs`
- **Purpose:** Full CRUD API for addiction programs on the admin dashboard.
- **Auth:** GET is public; POST/PUT/DELETE require `Authorization: Bearer <jwt>` header (verified against `ADMIN_JWT_SECRET`)
- **Input Validation:** All mutating requests validate field lengths server-side (title/subtitle ≤ 200, description ≤ 2000, note ≤ 500, cost ≤ 100, max 20 features each ≤ 300 chars). Client enforces the same limits via `FIELD_LIMITS` constant + `maxLength` HTML attrs.
- **Audit Log:** Writes `CREATE` / `UPDATE` / `DELETE` to `admin_audit_log` after every successful mutation (includes `actor_email` from JWT payload, `resource_id`, `title` in metadata).
- **Flow:**
  - `GET` — Returns all active programs (public)
  - `POST` — Validates fields → inserts → writes audit log
  - `PUT` — Validates fields → updates by ID → writes audit log
  - `DELETE` — Deletes by ID → writes audit log
- **Required Env:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_JWT_SECRET`

### 3. Netlify Function: `admin-training-programs`

- **File:** `netlify/functions/admin-training-programs.mjs`
- **Endpoint:** `GET/POST/PUT/DELETE /.netlify/functions/admin-training-programs`
- **Purpose:** Full CRUD API for training programs on the admin dashboard.
- **Auth:** GET is public; POST/PUT/DELETE require `Authorization: Bearer <jwt>` header
- **Input Validation:** Category must be 'internship' or 'traineeship'; title required; levels must be valid JSON array
- **Audit Log:** Writes `CREATE` / `UPDATE` / `DELETE` to `admin_audit_log` after every successful mutation
- **Required Env:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_JWT_SECRET`

### 4. Netlify Function: `whatsapp-crm` *(currently disabled)*

- **File:** `netlify/functions/whatsapp-crm.mjs`
- **Endpoint:** `POST /api/whatsapp-crm`
- **Status:** **Disabled (May 2026)** — client is switching WhatsApp CRM provider. Full handler commented out, replaced with a 503 stub. Original code preserved as line comments. Search for `WHATSAPP CRM DISABLED` to re-enable.
- **Purpose:** Server-side proxy to an external WhatsApp CRM API. Keeps the CRM token secret from the browser.
- **Auth:** Bearer token from `WHATSAPP_CRM_TOKEN` env var
- **CORS:** Restricted to `hopetrustindia.com`, `www.hopetrustindia.com`, `localhost:3000`
- **Flow:**
  1. Client sends POST to `/api/whatsapp-crm`
  2. Function forwards request to `CRM_ENDPOINT` with Bearer auth
  3. Returns CRM response to client
- **Error Handling:** Returns 405 for non-POST, 500 if CRM not configured, 502 if CRM request fails

### 5. Client-Side Supabase Calls (No Server API)

Forms submit **directly from the browser** to Supabase using the anon key:

| Form            | Table                    | Additional                          |
| --------------- | ------------------------ | ----------------------------------- |
| Contact form    | `contact_submissions`    | Also POSTs to Netlify Forms backup  |
| Join Us form    | `joinus_applications`    | Uploads CV to `cv-uploads` bucket first |

The newsletter form doesn't write to Supabase directly: it posts to the `newsletter-subscribe` function (see "Newsletter (October 2026)").

---

## Page Routes & Rendering Strategy

| Route                      | Component                          | Rendering   | Data Source                        |
| -------------------------- | ---------------------------------- | ----------- | ---------------------------------- |
| `/`                        | `app/page.tsx`                     | Static SSG  | None (hardcoded content). Newsletter section (`LargeRectangleSection`) currently disabled. |
| `/about`                   | `app/about/page.tsx`               | Client CSR  | None (hardcoded + assets)          |
| `/mental-health`           | `app/mental-health/page.tsx`       | Client CSR  | None (hardcoded content)           |
| `/addiction`               | `app/addiction/page.tsx`           | Client CSR  | Netlify fn: active programs        |
| `/blogs`                   | `app/blogs/page.tsx`               | Static SSG  | MDX files (filesystem)             |
| `/blogs/[slug]`            | `app/blogs/[slug]/page.tsx`        | Static SSG  | MDX file by slug                   |
| `/book-your-session`       | `app/book-your-session/page.tsx`   | Client CSR  | Supabase `doctors` table           |
| `/contact`                 | `app/contact/page.tsx`             | Client CSR  | Supabase (form submit)             |
| `/admin`                   | `app/admin/page.tsx`               | Client CSR  | Netlify fns (login + programs CRUD)|
| `/training`                | `app/training/page.tsx`            | Client CSR  | Netlify fn: training programs       |
| `/corporate-wellness`      | `app/corporate-wellness/page.tsx`  | Client CSR  | None (hardcoded content)           |
| `/intervention-services`   | `app/intervention-services/page.tsx` | Client CSR | None (hardcoded content)          |
| `/sitemap`                 | `app/sitemap/page.tsx`             | Static SSG  | None (hardcoded links)             |

**Note:** Since `output: 'export'` is set, ALL pages are pre-rendered at build time. Client-side pages use `'use client'` for interactivity but are still served as static HTML.

---

## Blog System

### Architecture
- **~395 MDX files** stored in `content/blogs/`
- Migrated from WordPress using `scripts/migrate-wp.mjs`
- Each `.mdx` file has YAML frontmatter:

```yaml
---
title: "Post Title"
date: "2024-01-15"
excerpt: "Brief description"
categories: ["Mental Health", "Wellness"]
tags: ["anxiety", "therapy"]
featuredImage: "https://..."
author: "Hope Trust"
slug: "post-slug"
wpLink: "https://original-wordpress-url"
---

Markdown content here...
```

### Reading Pipeline
1. `lib/blog.ts` reads MDX files from filesystem using `fs.readFileSync`
2. Parses frontmatter with `gray-matter`
3. Calculates reading time with `reading-time`
4. Blog listing page (`/blogs`) uses `getAllPostsMeta()` — returns metadata only (no content)
5. Blog detail page (`/blogs/[slug]`) uses `getPostBySlug()` — returns full content
6. Content rendered: `marked.parse()` → `sanitize-html` (XSS protection) → `dangerouslySetInnerHTML`

### SEO Features
- `generateStaticParams()` pre-renders all blog slugs at build time
- `generateMetadata()` sets per-page title, description, OpenGraph
- `JsonLd` component outputs `BlogPosting` schema.org structured data
- Previous/Next post navigation with `getAdjacentPosts()`

---

## Key Library Modules

### `lib/supabase.ts`
Singleton Supabase client using public anon key. Used by all client-side form submissions and the doctors directory.

### `lib/doctors.ts`
- **`fetchDoctors()`** — Queries active doctors ordered by `display_order`, maps snake_case DB columns to camelCase TypeScript types
- **`fetchDepartments()`** — Returns unique department names from active doctors

### `lib/programs.ts`
- **`UnauthorizedError`** — Custom error class thrown when any API call returns HTTP 401. Callers catch this to trigger automatic logout.
- **`fetchPrograms()`** — Queries active programs (public, no auth)
- **`createProgram(token, data)`** — Creates new program; throws `UnauthorizedError` on 401
- **`updateProgram(token, data)`** — Updates program by ID; throws `UnauthorizedError` on 401
- **`deleteProgram(token, id)`** — Deletes program by ID; throws `UnauthorizedError` on 401

### `lib/blog.ts`
- **`getAllPosts()`** — Reads all `.mdx` files, sorts by date descending
- **`getAllPostsMeta()`** — Same but strips content (lighter for listing pages)
- **`getPostBySlug(slug)`** — Reads single MDX file by slug
- **`getAllSlugs()`** — Returns all blog slugs (for `generateStaticParams`)
- **`getAllCategories()`** / **`getAllTags()`** — Aggregates unique categories/tags
- **`getAdjacentPosts(slug)`** — Returns prev/next posts for navigation

### `lib/config.ts`
Centralized site configuration:
- Site name and URL
- Contact emails (frontoffice, training)
- Phone numbers (main, secondary, training)
- ~~WhatsApp URL~~ *(disabled — `whatsappUrl` commented out, search `WHATSAPP CRM DISABLED`)*
- Physical address (with Google Maps directions URL)
- Google Maps embed URL

### `lib/assets.ts`
- **`getStorageUrl(bucket, path)`** — Builds Supabase storage public URL for any bucket (uses `NEXT_PUBLIC_SUPABASE_URL`)
- **`getAssetUrl(path)`** — Convenience wrapper for the `hopetrust assets` bucket (delegates to `getStorageUrl`)
- **`getLogoUrl()`** — Returns logo URL (used in layout favicon)

### `lib/jsonld.ts`
JSON-LD structured data generators for SEO:
- **`getOrganizationSchema()`** — `Organization` + `MedicalBusiness` with address, geo, opening hours, medical specialties, social links
- **`getWebSiteSchema()`** — `WebSite` schema with publisher reference
- **`getServiceSchema(opts)`** — `MedicalTherapy` schema for service pages (name, description, url, serviceType)
- **`getBreadcrumbSchema(items)`** — `BreadcrumbList` schema from array of `{ name, url }`
- **`getFAQSchema(faqs)`** — `FAQPage` schema from array of `{ question, answer }`

### `lib/training-programs.ts`
- **`TrainingProgramLevel`** — TypeScript interface: `{ label, hours, price }`
- **`TrainingProgram`** — TypeScript interface for full training program record
- **`fetchTrainingPrograms()`** — Fetches active training programs (public, no auth)
- **`createTrainingProgram(token, data)`** — Creates new program (admin auth required)
- **`updateTrainingProgram(token, data)`** — Updates program by ID (admin auth required)
- **`deleteTrainingProgram(token, id)`** — Deletes program by ID (admin auth required)

---

## Custom Hooks

### `useScrollAnimation`
IntersectionObserver-based hook that returns `{ elementRef, isVisible }`. Features:
- Configurable `threshold`, `rootMargin`, `triggerOnce`
- Uses `requestAnimationFrame` for smooth updates
- Auto-disconnects observer after first trigger (when `triggerOnce`)
- Exports animation presets: `fadeInUp`, `fadeInLeft`, `fadeInRight`, `scaleIn`, `fadeIn` — all GPU-accelerated with `translate3d` and `willChange`

---

## Environment Variables

| Variable                            | Scope      | Used By                                    |
| ----------------------------------- | ---------- | ------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`          | Client     | Supabase client + asset URLs               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | Client     | Supabase client (public key)               |
| `NEXT_PUBLIC_WHATSAPP_NUMBER`       | Client     | WhatsApp floating button *(disabled)*      |
| `NEXT_PUBLIC_SITE_URL`              | Client     | Sitemap, newsletter, OG tags               |
| `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_URL` | Client     | Contact page map iframe                    |
| `CRM_ENDPOINT`                      | Server     | Netlify whatsapp-crm function *(disabled)* |
| `WHATSAPP_CRM_TOKEN`               | Server     | Netlify whatsapp-crm auth *(disabled)*     |
| `ADMIN_JWT_SECRET`                  | Server     | Sign/verify admin JWTs (admin-login + admin-programs) |
| `RESEND_API_KEY`                    | Server     | Newsletter functions + enrollment emails (Full access key) |
| `RESEND_NEWSLETTER_SEGMENT_ID`      | Server     | Newsletter functions (Resend "Newsletter" segment) |
| `NEWSLETTER_FROM_EMAIL`            | Server     | Newsletter "from" address                  |
| `SUPABASE_SERVICE_ROLE_KEY`        | Server     | admin-login, admin-programs, newsletter fn |

---

## Build & Deployment

### Build Process
```bash
npm run build    # next build && node scripts/generate-sitemap.mjs
```
1. Next.js static export generates all pages into `out/`
2. `generate-sitemap.mjs` creates `sitemap.xml` (11 static pages + all ~395 blog slugs, per-page priority/changefreq) and `robots.txt` (blocks `/admin/`)

### Netlify Configuration (`netlify.toml`)
- **Build command:** `npm run build`
- **Publish directory:** `out`
- **Node version:** 18
- **Redirects:**
  - `/blog/:slug` → `/blogs/:slug/` (301) — WordPress legacy URLs
  - `/blog/` → `/blogs/` (301)
  - `/*` → `/index.html` (200) — SPA fallback
- **Security Headers:** CSP, HSTS (2-year, preload), X-Frame-Options DENY, X-XSS-Protection, X-Content-Type-Options nosniff, strict Referrer-Policy, Permissions-Policy (camera/mic/geo denied; payment denied — Razorpay currently disabled)
- **Razorpay Security (create-order.mjs):**
  - **Rate limiting:** DB-backed per-IP (10/15 min) and per-email (5/15 min) via `enrollments` table queries
  - **Duplicate order guard:** Reuses existing `created` order for same email + program within 30 min
  - **Idempotency key:** `Idempotency-Key` header stored in `metadata.idempotency_key`; repeat requests return cached enrollment
  - **Request size limit:** 4 KB body cap on create-order; 64 KB on webhook
  - **IP trust:** Client IP forwarded to Razorpay `notes.ip` for fraud scoring + used for rate limiting
  - **HMAC-SHA256 webhook verification** with constant-time comparison (`crypto.timingSafeEqual`)
  - **Server-side price resolution** — client cannot influence the payment amount
- **Caching:** Immutable for `/_next/static/*`, JS, CSS, fonts; 1-year for images, videos

### NPM Scripts
| Script           | Command                               |
| ---------------- | ------------------------------------- |
| `dev`            | `next dev`                            |
| `dev:netlify`    | `netlify dev` (with functions)        |
| `build`          | `next build && node scripts/generate-sitemap.mjs` |
| `start`          | `next start`                          |
| `lint`           | `next lint`                           |
| `test`           | `vitest`                              |
| `test:run`       | `vitest run`                          |
| `test:coverage`  | `vitest run --coverage`               |

---

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        USER BROWSER                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Static Pages ──────── Netlify CDN (pre-built HTML/JS/CSS)   │
│                                                              │
│  Contact Form ────┬──► Supabase (contact_submissions INSERT) │
│                   └──► Netlify Forms (backup)                │
│                                                              │
│  Join Us Form ────┬──► Supabase Storage (cv-uploads bucket)  │
│                   ├──► Supabase (joinus_applications INSERT) │
│                   └──► Netlify Forms (backup)                │
│                                                              │
│  Newsletter ──────────► Netlify Function ──► Supabase/Resend │
│                                                              │
│  Doctor List ─────────► Supabase (doctors SELECT active)     │
│                                                              │
│  WhatsApp CRM ────────► Netlify Function ──► External CRM    │  *(currently disabled)*
│                                                              │
│  Blog Pages ──────────► Pre-built at build from MDX files    │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    ADMIN / BACKEND                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Newsletter Send ─────► Netlify Function (issues API)        │
│                         ├── Push pending changes to Resend   │
│                         ├── Render the issue's email HTML    │
│                         └── Create one Resend broadcast      │
│                                                              │
│  Doctor Management ───► Supabase Dashboard (service_role)    │
│  Form Submissions ────► Supabase Dashboard / Netlify Forms   │
│  Blog Management ─────► Edit MDX files → Rebuild & Deploy    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Design System & Branding

### Colors
| Token           | Hex       | Usage                            |
| --------------- | --------- | -------------------------------- |
| Primary Dark    | `#00373E` | Headers, buttons, dark sections  |
| Primary Orange  | `#ED7428` / `#F97316` / `#F06D00` | Accents, CTAs, links |
| Background Warm | `#F7F6F4` / `#F7F5EF` / `#F6EFE8` | Page backgrounds |
| Background Peach| `#FFF7ED` / `#FFF5ED` / `#FEF2EB` | Card backgrounds |
| Card Peach      | `#F9E6D0` / `#FFEBD7`             | Feature cards    |
| Text Secondary  | `#486364` / `#6A8181`              | Body text        |

### Typography
- **Primary:** Inter (system font, loaded via `next/font/google`)
- **Display:** Bricolage Grotesque (headings, body in content pages)
- **Code/Mono:** IBM Plex Sans (select headings)

### Component Patterns
- Rounded corners: `rounded-2xl` to `rounded-[60px]` (large, organic feel)
- Glassmorphism: `bg-white/80 backdrop-blur-sm` on cards
- Shadows: Soft, layered (`shadow-[0_20px_50px_rgba(0,0,0,0.03)]`)
- Animations: Scroll-triggered fade-in/slide-in, hover lift (`y: -12`), scale on hover
- All home sections are code-split via `next/dynamic` for performance

---

## SEO Implementation

### Global (Root Layout — `app/layout.tsx`)
- **Metadata:** title template (`%s | Hope Trust`), description, keywords, authors, robots (`index, follow`), `metadataBase` (`https://hopetrustindia.com`)
- **Canonical:** `alternates.canonical: '/'`
- **OpenGraph:** title, description, type, siteName, locale (`en_IN`), url, image (logo)
- **Icons:** favicon + apple-touch from `getLogoUrl()`
- **JSON-LD:** `Organization` + `MedicalBusiness` schema + `WebSite` schema (every page)
- **Font preloading:** dns-prefetch + preconnect for Google Fonts

### Per-Page Layouts
Every sub-page layout exports its own `metadata` object with:
- **title** — unique per page
- **description** — unique per page
- **keywords** — relevant to the page content
- **alternates.canonical** — relative path (resolved via `metadataBase`)
- **openGraph** — title, description, type, siteName

### JSON-LD Structured Data
| Schema Type | Where Applied |
| --- | --- |
| `Organization` + `MedicalBusiness` | Root layout (all pages) |
| `WebSite` | Root layout (all pages) |
| `MedicalTherapy` | `/mental-health`, `/addiction`, `/training`, `/corporate-wellness`, `/intervention-services` |
| `BreadcrumbList` | All 8 sub-page layouts |
| `BlogPosting` | `/blogs/[slug]` (individual blog posts) |

### Sitemap & Robots
- **`scripts/generate-sitemap.mjs`** — runs post-build, generates `sitemap.xml` + `robots.txt`
- 11 static pages with per-page `priority` (1.0 → 0.3) and `changefreq` (weekly/monthly)
- All ~395 blog slugs included (priority 0.6)
- `robots.txt` allows all, blocks `/admin/`, includes sitemap URL

### Helper Files
- **`lib/jsonld.ts`** — reusable schema generators (`getOrganizationSchema`, `getWebSiteSchema`, `getServiceSchema`, `getBreadcrumbSchema`, `getFAQSchema`)
- **`components/JsonLd.tsx`** — `<script type="application/ld+json">` wrapper component

---

*Last updated: May 23, 2026 (WhatsApp CRM disabled — client switching provider)*
