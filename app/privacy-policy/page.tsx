import Header from '@/components/Header';
import dynamic from 'next/dynamic';
import { Bricolage_Grotesque } from 'next/font/google';
import { DEFAULT_SHARE_IMAGE } from '@/lib/share-images';

const Footer = dynamic(() => import('@/components/Footer'));

const headingFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const bodyFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500'],
});

export const metadata = {
  title: 'Privacy Policy',
  description:
    'How Hope Trust (Arel Hope Recovery Services LLP) collects, uses, and protects your personal information.',
  alternates: {
    canonical: '/privacy-policy/',
  },
  openGraph: {
    title: 'Privacy Policy | Hope Trust',
    description:
      'Terms and conditions of use for the Hope Trust website.',
    type: 'website',
    siteName: 'Hope Trust',
    images: [DEFAULT_SHARE_IMAGE],
  },
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F7F5EF]">
        <section className="mx-auto max-w-4xl px-4 sm:px-8 pb-20 pt-32 sm:pt-36">
          <h1
            className={`${headingFont.className} text-3xl sm:text-4xl lg:text-5xl font-bold text-[#00373E] mb-12`}
          >
            Privacy Policy
          </h1>

          <div className="space-y-10">
            <div className={`${bodyFont.className} space-y-4 text-[#00373E]/80 text-base sm:text-lg`}>
              <p>
                Welcome to the website of Hope Trust (Arel Hope Recovery Services LLP). If you continue to
                browse and use this website, you are agreeing to comply with and be bound by the following
                terms and conditions of use, which together with our privacy policy govern Hope Trust&apos;s
                relationship with you in relation to this website. If you disagree with any part of these terms
                and conditions, please do not use our website.
              </p>
              <p>
                The term Hope Trust or Arel Hope Recovery Services LLP or us or we refers to the owners of the
                website whose email address is{' '}
                <a href="mailto:info@hopetrustindia.com" className="text-[#ED7428] hover:underline">info@hopetrustindia.com</a>.
                The term you refers to the user or viewer of our website.
              </p>
            </div>

            <div>
              <h2
                className={`${headingFont.className} text-xl sm:text-2xl font-bold text-[#00373E] mb-4`}
              >
                The use of this website is subject to the following terms of use:
              </h2>
              <ul className={`${bodyFont.className} list-disc pl-6 space-y-3 text-[#00373E]/80 text-base sm:text-lg`}>
                <li>
                  The content of the pages of this website is for your general information and use only. It is
                  subject to change without notice.
                </li>
                <li>
                  Neither we nor any third parties provide any warranty or guarantee as to the accuracy,
                  timeliness, performance, completeness or suitability of the information and materials found
                  or offered on this website for any particular purpose. You acknowledge that such
                  information and materials may contain inaccuracies or errors, and we expressly exclude
                  liability for any such inaccuracies or errors to the fullest extent permitted by law.
                </li>
                <li>
                  Your use of any information or materials on this website is entirely at your own risk, for
                  which we shall not be liable. It shall be your own responsibility to ensure that any products,
                  services or information available through this website meet your specific requirements.
                </li>
                <li>
                  This website contains material which is owned by or licensed to us. This material includes,
                  but is not limited to, the design, layout, look, appearance and graphics. Reproduction is
                  prohibited other than in accordance with the copyright notice, which forms part of these
                  terms and conditions.
                </li>
                <li>
                  All trademarks reproduced in this website, which are not the property of, or licensed to the
                  operator, are acknowledged on the website and/or used by permission of the owners.
                </li>
                <li>
                  Unauthorized use of this website may give rise to a claim for damages and/or be a criminal
                  offence.
                </li>
                <li>
                  From time to time, this website may also include links to other websites. These links are
                  provided for your convenience to provide further information. They do not signify that we
                  endorse the website(s). We have no responsibility for the content of the linked website(s).
                </li>
                <li>
                  These Terms are governed and construed to be in accordance with the Laws of India. You
                  hereby irrevocably consent to the exclusive jurisdiction and venue of the Courts in
                  Hyderabad, Telangana, in all disputes arising out of or relating to the use of the Website.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Gradient video strip */}
        <div className="relative h-24 sm:h-32 w-full overflow-hidden">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source
              src="https://mjgbotzrjmwggzwkoovi.supabase.co/storage/v1/object/public/hopetrust%20assets/348932.mp4"
              type="video/mp4"
            />
          </video>
        </div>
      </main>
      <Footer />
    </>
  );
}
