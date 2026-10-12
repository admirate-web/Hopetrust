import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getAllPostsMeta,
  getCategoriesWithCounts,
  getArchiveCategories,
  getCategoryBySlug,
  getPostsByCategory,
  paginate,
  pageCount,
} from '@/lib/blog';
import Header from '@/components/Header';
import BlogListClient from '@/components/BlogListClient';
import { serializeJsonLd } from '@/components/JsonLd';
import { siteConfig } from '@/lib/config';
import { DEFAULT_SHARE_IMAGE } from '@/lib/share-images';

export function generateStaticParams() {
  return getArchiveCategories().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) return { title: 'Category Not Found' };

  return {
    title: `${category.name} Articles`,
    description: `${category.count} article${category.count !== 1 ? 's' : ''} on ${category.name.toLowerCase()} from the Hope Trust team — mental health and addiction recovery specialists in Hyderabad.`,
    keywords: `${category.name}, ${category.name} articles, mental health, Hope Trust`,
    ...(category.indexable ? {} : { robots: { index: false, follow: true } }),
    alternates: {
      canonical: `/blogs/category/${category.slug}/`,
    },
    openGraph: {
      title: `${category.name} Articles | Hope Trust`,
      description: `Articles on ${category.name.toLowerCase()} from the Hope Trust team.`,
      type: 'website',
      siteName: 'Hope Trust',
      images: [DEFAULT_SHARE_IMAGE],
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  const inCategory = getPostsByCategory(category.name);
  const posts = paginate(inCategory, 1);
  const categories = getCategoriesWithCounts();
  const allCount = getAllPostsMeta().length;

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${siteConfig.url}/blogs/category/${category.slug}/#collection`,
      url: `${siteConfig.url}/blogs/category/${category.slug}/`,
      name: `${category.name} Articles`,
      description: `Articles on ${category.name.toLowerCase()} from Hope Trust.`,
      isPartOf: { '@id': `${siteConfig.url}/blogs/#blog` },
      publisher: { '@id': `${siteConfig.url}/#organization` },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: inCategory.length,
        itemListElement: posts.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${siteConfig.url}/blogs/${p.slug}/`,
          name: p.title,
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteConfig.url}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${siteConfig.url}/blogs/` },
        {
          '@type': 'ListItem',
          position: 3,
          name: category.name,
          item: `${siteConfig.url}/blogs/category/${category.slug}/`,
        },
      ],
    },
  ];

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
          total={inCategory.length}
          allCount={allCount}
          page={1}
          totalPages={pageCount(inCategory.length)}
          basePath={`/blogs/category/${category.slug}`}
          activeCategory={category.name}
        />
      </main>
    </>
  );
}
