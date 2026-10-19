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
  title: 'Cancellation & Refund Policy',
  description:
    'Hope Trust\'s cancellation policy, refund policy, payment policy, and therapy consent form.',
  alternates: {
    canonical: '/cancellation-policy/',
  },
  openGraph: {
    title: 'Cancellation, Refund Policy and Consent Form | Hope Trust',
    description:
      'Hope Trust\'s cancellation, refund, and consent policies for all services.',
    type: 'website',
    siteName: 'Hope Trust',
    images: [DEFAULT_SHARE_IMAGE],
  },
};

export default function CancellationPolicyPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F7F5EF]">
        <section className="mx-auto max-w-4xl px-4 sm:px-8 pb-20 pt-32 sm:pt-36">
          <h1
            className={`${headingFont.className} text-3xl sm:text-4xl lg:text-5xl font-bold text-[#00373E] mb-12`}
          >
            Cancellation, Refund Policy and Consent Form
          </h1>

          <div className="space-y-10">
            {/* Cancellation Policy */}
            <div>
              <h2
                className={`${headingFont.className} text-xl sm:text-2xl font-semibold text-[#00373E] mb-4 border-b-2 border-[#ED7428]/30 pb-2`}
              >
                Cancellation Policy:
              </h2>
              <div className={`${bodyFont.className} space-y-4 text-[#00373E]/80 text-base sm:text-lg`}>
                <p>
                  If patient cancelling at least 12 hours before the scheduled appointment will be eligible for
                  a 50% refund.
                </p>
                <p>
                  Cancellation less than 12 hours will not be eligible for a refund. If the consultant cancels a
                  session, the patient will be refunded the entire amount paid, (or appointment rescheduled for a
                  mutually convenient time) irrespective of when the consultant has cancelled. Any transaction
                  charges/ taxes/ platform charges incurred by the company on receipts will be deducted from
                  the refund amount.
                </p>
                <p>
                  For rescheduling the appointment, the clients can coordinate with Hope Trust. Rescheduling for
                  the specific appointment is only allowed once, after which the appointment stands cancelled.
                </p>
              </div>
            </div>

            {/* Exceptions */}
            <div>
              <h2
                className={`${headingFont.className} text-xl sm:text-2xl font-semibold text-[#00373E] mb-4 border-b-2 border-[#ED7428]/30 pb-2`}
              >
                Exceptions:
              </h2>
              <p className={`${bodyFont.className} text-[#00373E]/80 text-base sm:text-lg`}>
                In case of emergencies or unique circumstances, the organization can allow a refund as per
                their discretion.
              </p>
            </div>

            {/* No-Show Policy */}
            <div>
              <h2
                className={`${headingFont.className} text-xl sm:text-2xl font-semibold text-[#00373E] mb-4 border-b-2 border-[#ED7428]/30 pb-2`}
              >
                No-Show Policy for Appointment Bookings:
              </h2>
              <p className={`${bodyFont.className} text-[#00373E]/80 text-base sm:text-lg`}>
                An appointment will be considered a no-show if the patient does not join the session link (in case
                of an online session) within 15 minutes of the agreed start time and no refunds.
              </p>
            </div>

            {/* Payment Policy */}
            <div>
              <h2
                className={`${headingFont.className} text-xl sm:text-2xl font-semibold text-[#00373E] mb-4 border-b-2 border-[#ED7428]/30 pb-2`}
              >
                Payment Policy:
              </h2>
              <p className={`${bodyFont.className} text-[#00373E]/80 text-base sm:text-lg`}>
                All sessions are strictly pre-paid. Sessions are confirmed only if payment is completed in advance.
              </p>
            </div>

            {/* Office Timings */}
            <div>
              <h2
                className={`${headingFont.className} text-xl sm:text-2xl font-semibold text-[#00373E] mb-4 border-b-2 border-[#ED7428]/30 pb-2`}
              >
                Office Timings:
              </h2>
              <p className={`${bodyFont.className} text-[#00373E]/80 text-base sm:text-lg`}>
                Please note that our office hours are 10 AM – 7 PM, Monday to Saturday only (Excluding Sundays
                and gazette holidays). Any communication outside of office hours (patient
                cancellation, rescheduling) will be addressed during the next day.
              </p>
            </div>

            {/* Divider */}
            <hr className="border-[#ED7428]/20" />

            {/* Consent Form – Therapy */}
            <div>
              <h2
                className={`${headingFont.className} text-xl sm:text-2xl font-semibold text-[#00373E] mb-4 border-b-2 border-[#ED7428]/30 pb-2`}
              >
                Consent Form – Therapy
              </h2>
              <p className={`${bodyFont.className} text-[#00373E]/80 text-base sm:text-lg mb-6`}>
                Consent form is mandatory for being in the therapy dually signed by the client/ Therapist
              </p>

              {/* No. Of Sessions */}
              <h3 className={`${headingFont.className} text-lg sm:text-xl font-semibold text-[#00373E] mb-2`}>
                No. Of Sessions
              </h3>
              <p className={`${bodyFont.className} text-[#00373E]/80 text-base sm:text-lg mb-6`}>
                It depends on the client&apos;s progress, continuity in attending the sessions and cooperation in
                doing home assignments.
              </p>

              {/* Relationship */}
              <h3 className={`${headingFont.className} text-lg sm:text-xl font-semibold text-[#00373E] mb-2`}>
                Relationship
              </h3>
              <p className={`${bodyFont.className} text-[#00373E]/80 text-base sm:text-lg mb-6`}>
                The required relationship that a client/patient should have with his/her therapist is strictly professional.
              </p>

              {/* Confidentiality */}
              <h3 className={`${headingFont.className} text-lg sm:text-xl font-semibold text-[#00373E] mb-2`}>
                Confidentiality
              </h3>
              <p className={`${bodyFont.className} text-[#00373E]/80 text-base sm:text-lg mb-6`}>
                Sessions between the therapist and the client/patient are strictly confidential. Any notes taken by
                the therapist during therapy shall be kept confidential and secure by the therapist at all times and
                shall not disclose it to anyone without any prior written consent by the client/patient, with exception
                to mandated by any court order.
              </p>

              {/* Risks */}
              <h3 className={`${headingFont.className} text-lg sm:text-xl font-semibold text-[#00373E] mb-2`}>
                Risks
              </h3>
              <p className={`${bodyFont.className} text-[#00373E]/80 text-base sm:text-lg mb-6`}>
                There may be a chance that during or after a session, the client/patient may feel emotionally or
                physically distressed. This is normal and should be part of one&apos;s healing process. A therapy&apos;s success
                shall depend both on the efforts of the therapist and the client/patient.
              </p>

              {/* Advantages */}
              <h3 className={`${headingFont.className} text-lg sm:text-xl font-semibold text-[#00373E] mb-2`}>
                Advantages
              </h3>
              <div className={`${bodyFont.className} space-y-4 text-[#00373E]/80 text-base sm:text-lg mb-6`}>
                <p>
                  Therapy helps in making one open his or her awareness. We at Hope Trust, understand that therapies
                  can be challenging especially for those who are not willing to open up. Uncomfortable feelings are
                  normal and are part of the process.
                </p>
                <p>
                  These frustrations and discomforts will be lessened as the therapy progress and patients shall have
                  a better positive outlook in managing his or her emotions.
                </p>
                <p>
                  There is no firm timeline for this progress. The progress depends upon therapeutic relationship
                  between the patient and the therapist, responsibility of the patient in attending the sessions at{' '}
                  <em>regular intervals and cooperation in doing the given home assignments.</em>
                </p>
              </div>

              {/* Court Proceedings */}
              <h3 className={`${headingFont.className} text-lg sm:text-xl font-semibold text-[#00373E] mb-2`}>
                Court Proceedings
              </h3>
              <div className={`${bodyFont.className} space-y-4 text-[#00373E]/80 text-base sm:text-lg`}>
                <p>
                  In case of a court proceeding involving the client/patient, it is agreed that the therapist cannot testify,
                  such as but not limited to, custody proceedings, divorce proceedings, injuries, or any other lawsuits,
                  that shall result in the disclosure of the records of the psychotherapist about his/her client/patient.
                </p>
                <p>
                  Please note that you may withdraw anytime from the psychotherapy upon notice.
                </p>
              </div>
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
            poster="/images/posters/gradient-background.webp"
          >
            <source
              src="/videos/gradient-background.mp4"
              type="video/mp4"
            />
          </video>
        </div>
      </main>
      <Footer />
    </>
  );
}
