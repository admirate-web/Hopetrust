import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Calendar,
  User,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import {
  getAllSlugs,
  getPostBySlug,
  getAdjacentPosts,
  getAllPostsMeta,
} from '@/lib/blog';
import { topicFor, relatedPosts } from '@/lib/post-topics';
import RelatedPosts from '@/components/RelatedPosts';
import PostFooterCta from '@/components/PostFooterCta';
import {
  getAuthorsBySlug,
  organizationAuthorRef,
  withCredential,
  type Author,
} from '@/lib/authors';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ImageFallback from '@/components/ImageFallback';
import { serializeJsonLd } from '@/components/JsonLd';
import { siteConfig } from '@/lib/config';
import { getLogoUrl } from '@/lib/assets';
import { DEFAULT_SHARE_IMAGE } from '@/lib/share-images';

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: 'Post Not Found' };

  const [author] = await getAuthorsBySlug([post.authorSlug]);
  const description = post.seoDescription || post.excerpt;

  return {
    // A search title, where set, is used exactly as written: it is chosen to
    // match what people search and is sized to fit without the site suffix.
    title: post.seoTitle ? { absolute: post.seoTitle } : post.title,
    description,
    authors: author
      ? [{ name: author.name, url: author.url }]
      : [{ name: post.author }],
    keywords: [
      ...post.tags,
      ...post.categories,
      'Hope Trust',
      'mental health',
    ].join(', '),
    alternates: {
      canonical: `/blogs/${slug}/`,
    },
    openGraph: {
      title: post.seoTitle || post.title,
      description,
      type: 'article',
      url: `${siteConfig.url}/blogs/${slug}/`,
      publishedTime: post.date,
      modifiedTime: post.modified,
      authors: [author ? author.name : post.author],
      images: post.featuredImage
        ? [{ url: absoluteUrl(post.featuredImage) }]
        : [DEFAULT_SHARE_IMAGE],
      siteName: 'Hope Trust',
    },
  };
}

/** JSON-LD and OG images must be absolute; frontmatter stores site-relative paths. */
function absoluteUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${siteConfig.url}${url.startsWith('/') ? '' : '/'}${url}`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function JsonLd({
  post,
  author,
  reviewer,
}: {
  post: NonNullable<ReturnType<typeof getPostBySlug>>;
  author: Author | null;
  reviewer: Author | null;
}) {
  const url = `${siteConfig.url}/blogs/${post.slug}/`;

  /**
   * `reviewedBy` and `lastReviewed` live on WebPage, not on the article, so the
   * page node is spelled out rather than left as a bare `@id` stub. It is typed
   * MedicalWebPage only when a clinician actually signed off — the type is a
   * claim about editorial process, and asserting it without a named reviewer
   * would be the same overstatement the byline work exists to remove.
   */
  const pageNode = reviewer
    ? {
        '@type': ['WebPage', 'MedicalWebPage'],
        '@id': url,
        reviewedBy: { '@id': reviewer.id },
        lastReviewed: post.reviewedOn,
      }
    : { '@type': 'WebPage', '@id': url };

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    mainEntityOfPage: pageNode,
    url,
    headline: post.title.slice(0, 110),
    description: post.seoDescription || post.excerpt,
    ...(post.summary && { abstract: post.summary }),
    datePublished: post.date,
    dateModified: post.modified || post.date,
    inLanguage: 'en-IN',
    // A named clinician is referenced by `@id` so the credentials declared on
    // their profile page attach to every article they sign. Posts with no named
    // author stay attributed to the organisation rather than borrowing one.
    author: author ? { '@id': author.id } : organizationAuthorRef(),
    ...(reviewer && { reviewedBy: { '@id': reviewer.id } }),
    publisher: {
      '@type': 'Organization',
      '@id': `${siteConfig.url}/#organization`,
      name: 'Hope Trust',
      logo: { '@type': 'ImageObject', url: getLogoUrl() },
    },
    ...(post.categories.length > 0 && { articleSection: post.categories }),
    ...(post.tags.length > 0 && { keywords: post.tags.join(', ') }),
    ...(post.featuredImage && { image: absoluteUrl(post.featuredImage) }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  );
}

/**
 * The named byline. Links to the practitioner's profile so a reader — or a
 * crawler assessing expertise — can reach their credentials in one hop.
 */
function Byline({ author, fallback }: { author: Author | null; fallback: string }) {
  if (!author) {
    return (
      <span className="inline-flex items-center gap-1 sm:gap-1.5">
        <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        {fallback}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 sm:gap-1.5">
      <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      <Link
        href={`/therapists/${author.slug}/`}
        className="font-medium text-[#00373E] underline-offset-2 transition-colors hover:text-[#ED7428] hover:underline"
      >
        {author.name}
      </Link>
      <span className="text-gray-400">&middot;</span>
      <span>{author.credential}</span>
    </span>
  );
}

/** Medical review notice. Rendered only when a clinician has actually signed off. */
function ReviewNotice({ reviewer, reviewedOn }: { reviewer: Author; reviewedOn?: string }) {
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#00373E]/10 bg-[#F2F7F7] px-3.5 py-3 sm:mt-6 sm:px-4">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#00373E]" />
      <p className="text-xs leading-relaxed text-gray-600 sm:text-sm">
        Medically reviewed by{' '}
        <Link
          href={`/therapists/${reviewer.slug}/`}
          className="font-medium text-[#00373E] underline-offset-2 hover:text-[#ED7428] hover:underline"
        >
          {withCredential(reviewer)}
        </Link>
        {reviewedOn && <> on {formatDate(reviewedOn)}</>}.
      </p>
    </div>
  );
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const [author, reviewer] = await getAuthorsBySlug([post.authorSlug, post.reviewedBy]);
  const { prev, next } = getAdjacentPosts(slug);
  const topic = topicFor(post);
  const related = relatedPosts(post, getAllPostsMeta());
  const rawHtml = marked.parse(post.content) as string;
  const htmlContent = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img', 'figure', 'figcaption', 'iframe', 'video', 'source',
      'h1', 'h2', 'details', 'summary',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      a: ['href', 'title', 'target', 'rel'],
      iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen'],
      video: ['src', 'controls', 'width', 'height'],
      source: ['src', 'type'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  });

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteConfig.url}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${siteConfig.url}/blogs/` },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: `${siteConfig.url}/blogs/${post.slug}/`,
      },
    ],
  };

  return (
    <>
      <JsonLd post={post} author={author} reviewer={reviewer} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbs) }}
      />
      <Header />
      <main className="min-h-screen bg-[#F7F6F4] pt-16 sm:pt-20">
        {/* Hero / Featured Image */}
        {post.featuredImage && (
          <div className="relative h-[200px] w-full overflow-hidden bg-[#00373E] sm:h-[320px] lg:h-[440px]">
            <ImageFallback
              src={post.featuredImage}
              alt={post.title}
              fill
              className="object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#00373E]/80 to-transparent" />
          </div>
        )}

          <article className="relative mx-auto w-full max-w-[820px] px-3 sm:px-6 lg:px-8">
            {/* Article header card */}
            <div
              className={`relative rounded-2xl bg-white px-4 py-6 shadow-[0_16px_48px_rgba(0,0,0,0.08)] sm:rounded-[28px] sm:px-8 sm:py-8 lg:px-10 lg:py-10 ${
                post.featuredImage ? '-mt-16 sm:-mt-24 lg:-mt-32' : 'mt-6 sm:mt-8'
              }`}
            >
              <Link
                href="/blogs"
                className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-[#ED7428] transition-colors hover:text-[#d4631f] sm:mb-6 sm:gap-2 sm:text-sm"
              >
                <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Back to all posts
              </Link>

              {post.categories.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5 sm:mb-4 sm:gap-2">
                  {post.categories.map((cat) => (
                    <span
                      key={cat}
                      className="rounded-full bg-[#FFF7ED] px-2.5 py-0.5 text-[10px] font-medium text-[#ED7428] sm:px-3 sm:py-1 sm:text-xs"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}

              <h1 className="mb-3 text-xl font-bold leading-tight text-[#00373E] sm:mb-4 sm:text-2xl lg:text-4xl">
                {post.title}
              </h1>

              <div className="flex flex-wrap items-center gap-2.5 text-xs text-gray-500 sm:gap-4 sm:text-sm">
                <Byline author={author} fallback={post.author} />
                <span className="inline-flex items-center gap-1 sm:gap-1.5">
                  <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <time dateTime={post.date.slice(0, 10)}>{formatDate(post.date)}</time>
                </span>
                {post.modified && post.modified.slice(0, 10) > post.date.slice(0, 10) && (
                  <span className="inline-flex items-center gap-1 sm:gap-1.5">
                    Updated{' '}
                    <time dateTime={post.modified.slice(0, 10)}>{formatDate(post.modified)}</time>
                  </span>
                )}
                <span className="inline-flex items-center gap-1 sm:gap-1.5">
                  <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  {post.readingTime}
                </span>
              </div>

              {reviewer && (
                <ReviewNotice reviewer={reviewer} reviewedOn={post.reviewedOn} />
              )}
            </div>

            {/* The direct answer, before the article. Most searches that reach
                these posts are questions ("name a common phobia", "psychology
                of people who don't post on social media"); answering in the
                first lines is what wins the featured snippet and the AI-answer
                citation, and keeps the reader who wanted only that. */}
            {post.summary && (
              <section
                aria-labelledby="summary-heading"
                className="mt-4 rounded-2xl bg-[#FFF7ED] px-4 py-5 ring-1 ring-[#ED7428]/15 sm:mt-8 sm:rounded-[28px] sm:px-8 sm:py-7 lg:px-10"
              >
                <h2
                  id="summary-heading"
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ED7428] sm:text-sm"
                >
                  In short
                </h2>
                <p className="mt-2 text-base leading-relaxed text-gray-800 sm:text-lg">
                  {post.summary}
                </p>
              </section>
            )}

            {/* Article body */}
            <div className="mt-4 rounded-2xl bg-white px-4 py-6 shadow-[0_16px_48px_rgba(0,0,0,0.04)] sm:mt-8 sm:rounded-[28px] sm:px-8 sm:py-8 lg:px-10 lg:py-10">
              <div
                className="blog-content"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />

              {post.tags.length > 0 && (
                <div className="mt-8 border-t border-gray-100 pt-4 sm:mt-10 sm:pt-6">
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-gray-200 px-2.5 py-0.5 text-[10px] text-gray-500 sm:px-3 sm:py-1 sm:text-xs"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <PostFooterCta topic={topic} />
            </div>

            <RelatedPosts posts={related} />

            {/* Previous / Next navigation */}
            <div className="mt-4 mb-12 grid gap-3 sm:mt-8 sm:mb-16 sm:gap-4 sm:grid-cols-2">
              {prev ? (
                <Link
                  href={`/blogs/${prev.slug}`}
                  className="group flex items-start gap-2.5 rounded-xl bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] transition-shadow duration-300 active:scale-[0.98] active:transition-transform [@media(hover:hover)]:hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] sm:gap-3 sm:rounded-2xl sm:p-5"
                >
                  <ChevronLeft className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#ED7428] transition-transform group-hover:-translate-x-1 sm:h-5 sm:w-5" />
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 sm:text-xs">Previous</p>
                    <p className="mt-0.5 text-xs font-semibold text-[#00373E] line-clamp-2 sm:mt-1 sm:text-sm">
                      {prev.title}
                    </p>
                  </div>
                </Link>
              ) : (
                <div />
              )}
              {next ? (
                <Link
                  href={`/blogs/${next.slug}`}
                  className="group flex items-start gap-2.5 rounded-xl bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] transition-shadow duration-300 active:scale-[0.98] active:transition-transform [@media(hover:hover)]:hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] sm:flex-row-reverse sm:gap-3 sm:rounded-2xl sm:p-5 sm:text-right"
                >
                  <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#ED7428] transition-transform group-hover:translate-x-1 sm:h-5 sm:w-5" />
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 sm:text-xs">Next</p>
                    <p className="mt-0.5 text-xs font-semibold text-[#00373E] line-clamp-2 sm:mt-1 sm:text-sm">
                      {next.title}
                    </p>
                  </div>
                </Link>
              ) : (
                <div />
              )}
            </div>

            {/* Contextual links so articles pass authority to service pages */}
            <aside className="mb-12 rounded-2xl bg-white px-4 py-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)] sm:mb-16 sm:rounded-[28px] sm:px-8 sm:py-8">
              <h2 className="text-base font-semibold text-[#00373E] sm:text-lg">
                Talk to someone at Hope Trust
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                If anything here felt familiar, our team in Hyderabad offers in-clinic and
                online support.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 sm:gap-3">
                <Link
                  href="/book-your-session/"
                  className="rounded-full bg-[#ED7428] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#d4631f] sm:text-sm"
                >
                  Book a session
                </Link>
                <Link
                  href="/mental-health/"
                  className="rounded-full border border-gray-200 px-4 py-2 text-xs font-medium text-[#00373E] transition-colors hover:border-[#ED7428] sm:text-sm"
                >
                  Mental health services
                </Link>
                <Link
                  href="/addiction/"
                  className="rounded-full border border-gray-200 px-4 py-2 text-xs font-medium text-[#00373E] transition-colors hover:border-[#ED7428] sm:text-sm"
                >
                  Addiction recovery
                </Link>
              </div>
            </aside>
          </article>
      </main>
      <Footer />
    </>
  );
}
