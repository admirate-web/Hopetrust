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

export const metadata = {
  title: 'Mental Health & Wellness Insights',
  description:
    'Articles on mental health, therapy, addiction recovery, relationships, and wellness from Hope Trust\'s team of experts.',
  keywords:
    'mental health blog, therapy articles, addiction recovery insights, wellness tips, Hope Trust blog, depression, anxiety, relationships',
  alternates: {
    canonical: '/blogs/',
  },
  openGraph: {
    title: 'Blog | Hope Trust',
    description:
      'Explore articles on mental health, therapy, addiction recovery, relationships, and wellness.',
    type: 'website',
    siteName: 'Hope Trust',
    images: [DEFAULT_SHARE_IMAGE],
  },
};

export default function BlogsPage() {
  const all = getAllPostsMeta();
  const categories = getCategoriesWithCounts();
  const posts = paginate(all, 1);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${siteConfig.url}/blogs/#blog`,
    url: `${siteConfig.url}/blogs/`,
    name: 'Hope Trust Blog',
    description:
      'Articles on mental health, therapy, addiction recovery, relationships and wellness.',
    publisher: { '@id': `${siteConfig.url}/#organization` },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${siteConfig.url}/blogs/${p.slug}/`,
      datePublished: p.date,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
      />
      <Header />
      <main className="min-h-screen bg-[#F7F6F4] pt-20">
        <BlogListClient
          posts={posts}
          categories={categories}
          total={all.length}
          allCount={all.length}
          page={1}
          totalPages={pageCount(all.length)}
          basePath="/blogs"
          featured={all[0]}
        />
      </main>
    </>
  );
}
