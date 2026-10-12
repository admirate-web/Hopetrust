import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getAllPostsMeta,
  getCategoriesWithCounts,
  paginate,
  pageCount,
} from '@/lib/blog';
import Header from '@/components/Header';
import BlogListClient from '@/components/BlogListClient';
import { serializeJsonLd } from '@/components/JsonLd';
import { siteConfig } from '@/lib/config';
import { DEFAULT_SHARE_IMAGE } from '@/lib/share-images';

/**
 * Pages 2..N of the blog archive. Page 1 lives at /blogs/ so there is no
 * duplicate — /blogs/p/1/ is deliberately not generated.
 */
export function generateStaticParams() {
  const total = pageCount(getAllPostsMeta().length);
  return Array.from({ length: Math.max(0, total - 1) }, (_, i) => ({
    n: String(i + 2),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ n: string }>;
}): Promise<Metadata> {
  const { n } = await params;
  const page = Number(n);
  const total = pageCount(getAllPostsMeta().length);

  return {
    title: `Mental Health & Wellness Insights — Page ${page}`,
    description: `Page ${page} of ${total} — articles on mental health, therapy, addiction recovery, relationships, and wellness from Hope Trust.`,
    alternates: {
      canonical: `/blogs/p/${page}/`,
    },
    openGraph: {
      title: `Blog — Page ${page} | Hope Trust`,
      description:
        'Explore articles on mental health, therapy, addiction recovery, relationships, and wellness.',
      type: 'website',
      siteName: 'Hope Trust',
      images: [DEFAULT_SHARE_IMAGE],
    },
  };
}

export default async function BlogArchivePage({
  params,
}: {
  params: Promise<{ n: string }>;
}) {
  const { n } = await params;
  const page = Number(n);
  const all = getAllPostsMeta();
  const totalPages = pageCount(all.length);

  if (!Number.isInteger(page) || page < 2 || page > totalPages) notFound();

  const posts = paginate(all, page);
  const categories = getCategoriesWithCounts();

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteConfig.url}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${siteConfig.url}/blogs/` },
      {
        '@type': 'ListItem',
        position: 3,
        name: `Page ${page}`,
        item: `${siteConfig.url}/blogs/p/${page}/`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbs) }}
      />
      <Header />
      <main className="min-h-screen bg-[#F7F6F4] pt-20">
        <BlogListClient
          posts={posts}
          categories={categories}
          total={all.length}
          allCount={all.length}
          page={page}
          totalPages={totalPages}
          basePath="/blogs"
        />
      </main>
    </>
  );
}
