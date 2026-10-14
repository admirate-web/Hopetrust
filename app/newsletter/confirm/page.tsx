import dynamic from 'next/dynamic';
import { Bricolage_Grotesque } from 'next/font/google';
import Header from '@/components/Header';
import NewsletterConfirm from '@/components/NewsletterConfirm';

const Footer = dynamic(() => import('@/components/Footer'));

const bodyFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

// A simple branded page, not a landing page (spec §7.3).
export default function NewsletterConfirmPage() {
  return (
    <>
      <Header />
      <main className={`${bodyFont.className} min-h-screen bg-[#F7F5EF]`}>
        <section className="mx-auto max-w-xl px-4 pb-20 pt-32 sm:px-8 sm:pt-36">
          <div className="rounded-3xl bg-white p-6 shadow-sm sm:p-10">
            <NewsletterConfirm />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
