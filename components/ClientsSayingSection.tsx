'use client';

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Bricolage_Grotesque } from "next/font/google";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const bodyFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["700"],
});

type Testimonial = {
  quote: string;
  author: string;
};

const testimonials: Testimonial[] = [
  {
    quote:
      "I had a great experience at Hope Trust. The clinical psychology internship was very productive with a lot of insights. Everyone is very friendly and professional had learned depth about the field covering all the base topics.",
    author: "Anonymous",
  },
  {
    quote:
      "Dr. Rajeshwari has been an invaluable support, providing thoughtful guidance and life-changing perspectives that helped me navigate personal and family challenges over the years.",
    author: "Anonymous",
  },
  {
    quote:
      "Mrs. Rajeswari Luther supported me through one of the most difficult phases of my life with empathy, practical guidance, and meaningful insights that helped me rebuild myself and better support my son through recovery.",
    author: "Anonymous",
  },
  {
    quote:
      "Was referred to Dr. Tina through a friend, and I\u2019m so grateful for her guidance and support. Every time I talk to her, I feel more positive and gain a fresh perspective on life. She\u2019s sweet, kind, a great listener, and so generous with her time and energy.",
    author: "Anonymous",
  },
  {
    quote:
      "Exceptional experience at Hope Trust. From the moment I walked in, I felt welcomed and understood. The staff are highly professional, compassionate, and knowledgeable. The environment is calming and conducive to healing. I highly recommend Hope Trust.",
    author: "Anonymous",
  },
  {
    quote:
      "Hope Trust really a great place to get back hope on life. Rajeshwari Ma\u2019am is more than just a doctor; she\u2019s a teacher and a guide who instills hope in life and helps understand mental health conditions.",
    author: "Anonymous",
  },
  {
    quote:
      "I had a wonderful experience at Hope Trust. The Clinical Internship Programme has helped me a lot in gaining knowledge in the practical aspects of psychology. The sessions were quite interactive.",
    author: "Anonymous",
  },
  {
    quote:
      "Insights that Dr. Rajeshwari has given over the course of time has really helped me get through tough times and understand myself better. If you are looking for sessions to connect back to your real self, this is the place. I would highly recommend it.",
    author: "Anonymous",
  },
  {
    quote:
      "Dr. Rajeshwari helped me get past my anxieties and understand myself a lot better after several distressing incidents. Her guidance was truly life-changing.",
    author: "A.T.",
  },
  {
    quote:
      "Dr. Rajeshwari Luther helped me understand and overcome my childhood trauma, grief, and anxiety. Her EFT therapy sessions helped me the most. I\u2019d definitely recommend her.",
    author: "Anonymous",
  },
  {
    quote:
      "I\u2019m extremely happy with the methods Dr. Rajeshwari chose to treat my symptoms. I see a marked improvement in myself and look forward to more sessions.",
    author: "K.R.",
  },
  {
    quote:
      "Dr. Rajeshwari is a brilliant listener who never makes you feel rushed. She gives you all the space to talk deeply, asks the right questions, and genuinely cares about her clients. I can\u2019t recommend her enough.",
    author: "Aditya",
  },
  {
    quote:
      "The ideas shared were very practical and effective. Dr. Rajeshwari\u2019s friendliness allows you to open up, and her subtle questions rewire your thinking in a healthier, more positive way.",
    author: "A.",
  },
  {
    quote:
      "Dr. Rajeshwari created a safe space for me to open up. Her guidance was effective and thoughtful, helping me find clarity and peace. I always left sessions feeling hopeful and understood.",
    author: "V.M.T.",
  },
  {
    quote:
      "I\u2019ve been seeing Dr. Rajeshwari for nearly 5 years. She\u2019s a patient listener, gives wise advice, and is excellent at connecting the dots. She\u2019s helped me build important perspective on life.",
    author: "S.K.P.",
  },
  {
    quote:
      "Dr. Rajeshwari is an empathetic therapist who truly listens without judgment. Her approach blends professional structure with genuine warmth. Highly recommended for anyone seeking emotional clarity and growth.",
    author: "Anonymous",
  },
  {
    quote:
      "Dr. Rajeshwari is consistently patient with my partner and me. Her guidance is empathetic and practical, and working with her has made a real positive difference in how we communicate.",
    author: "A.",
  },
  {
    quote:
      "Dr. Rajeshwari\u2019s therapeutic process is outstanding. She helped me understand my emotional patterns with remarkable clarity and kindness. Her sessions are structured, insightful, and genuinely empowering.",
    author: "C.T.R.",
  },
  {
    quote:
      "Ms. Tina has helped me understand and speak to parts of me that no one else could address. Her somatic practice and curious questions help you unravel the innate wisdom within yourself.",
    author: "R.V.V.",
  },
  {
    quote:
      "Ms. Tina is a wonderful therapist who creates a safe space to open up. She tailors her approach to my specific needs and her empathetic nature makes me feel truly heard and understood.",
    author: "A.",
  },
  {
    quote:
      "Dr. Tina is brilliant, loving, and caring. In nine months, she\u2019s helped me become more aware of my needs and boundaries. My communication skills have improved in both personal and professional life.",
    author: "V.J.",
  },
  {
    quote:
      "Dr. Nishant gave a very patient ear to all my problems. He doesn\u2019t just give you medication \u2014 he tells you the root cause too. Very helpful for my sleep disorder and anxiety.",
    author: "V.K.",
  },
  {
    quote:
      "Consulting Dr. Nishant was great. He tries to understand his patient\u2019s personality along with the symptoms to get to the root cause. I look forward to my follow-up sessions.",
    author: "T.A.",
  },
  {
    quote:
      "The sessions with Dr. Nishant were extremely helpful. The medication he prescribed helped me a lot. He\u2019s quite patient and I feel very confident with his approach.",
    author: "S.S.",
  },
  {
    quote:
      "Dr. Vidhya Sagar explained my OCD compulsions clearly and recommended exercises like deep breathing that greatly reduce stress. Even Dr. Janardhan Reddy of NIMHANS advised me to seek CBT from him.",
    author: "K.D.",
  },
  {
    quote:
      "Dr. Vidyasagar is a hardcore professional who shoots it straight. His chair exercise left a deep impact on me. He makes everything sound treatable with a touch of straight-face humour.",
    author: "U.W.",
  },
  {
    quote:
      "Dr. Vidya Sagar creates a safe space and listens patiently. Over a few sessions, he helps you analyse the root cause of problems and become self-reliant to tackle them effectively.",
    author: "A.",
  },
  {
    quote:
      "Ms. Muskan had a good vibe about her. I felt comfortable sharing my experiences, and she approached my issues with a positive perspective.",
    author: "Anonymous",
  },
  {
    quote:
      "In just a few months, Ms. Muskan has helped me grow as a person, deal with traumatic experiences, and become myself again. She helped me pick myself up from scratch.",
    author: "P.R.",
  },
  {
    quote:
      "Tina Fernandez is really well experienced professional, she makes you feel deeply understood, valued and comfortable. She has  a unique eclectic approach of working with her clients that helps both the client and therapist to tailor make their journey towards alignment, healing and a deep felt sense of grounded strength. I am blessed to have found her as my therapist.",
    author: "S.U",
  },
];

export default function ClientsSayingSection() {
  const [index, setIndex] = useState(0);
  const [typedHeading, setTypedHeading] = useState("");
  const [showCursor, setShowCursor] = useState(true);

  const { elementRef: headingRef, isVisible: headingVisible } = useScrollAnimation({
    threshold: 0.2,
  });
  const hasStartedTypingRef = useRef(false);

  // Typing animation for heading "What Our Clients\n\nAre Saying"
  useEffect(() => {
    // Start typing only when the heading section is in view, and only once
    if (!headingVisible || hasStartedTypingRef.current) return;

    hasStartedTypingRef.current = true;

    const fullText = "What our clients\nare saying";
    let currentIndex = 0;

    const interval = setInterval(() => {
      currentIndex += 1;
      setTypedHeading(fullText.slice(0, currentIndex));

      if (currentIndex >= fullText.length) {
        clearInterval(interval);
      }
    }, 60);

    return () => {
      clearInterval(interval);
    };
  }, [headingVisible]);

  // Blinking cursor for the typing effect
  useEffect(() => {
    if (!headingVisible) return;

    const blink = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 500);

    return () => clearInterval(blink);
  }, [headingVisible]);

  const [firstLine, secondLine = ""] = typedHeading.split("\n");

  const visible = [
    testimonials[index % testimonials.length],
    testimonials[(index + 1) % testimonials.length],
  ];

  const handleNext = () => {
    setIndex((prev) => (prev + 1) % testimonials.length);
  };

  const handlePrev = () => {
    setIndex((prev) =>
      prev === 0 ? testimonials.length - 1 : prev - 1
    );
  };

  return (
    // data-nosnippet: the testimonials stay on the page, but Google may not
    // quote them as the snippet under a search result. It did — "Rajeshwari has
    // been an invaluable support…" was the text under the homepage result.
    <section data-nosnippet className="w-full bg-white py-16 sm:py-20">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 sm:px-6 lg:flex-row lg:items-stretch lg:gap-16">
        {/* Left column: heading (with typing animation) and description */}
        <div
          ref={headingRef as React.RefObject<HTMLDivElement>}
          className="w-full max-w-md space-y-4 text-[#00373E]"
        >
          <h2
            className={`${bodyFont.className} text-2xl sm:text-3xl lg:text-4xl font-semibold leading-tight whitespace-pre-line min-h-[3rem] sm:min-h-[3.5rem]`}
          >
            {firstLine}
            <br />
            <span className="inline-flex items-center">
              {secondLine}
              {/* Typing cursor */}
              <span
                className="ml-1 inline-block w-[2px] h-[1.1em] bg-[#00373E] align-bottom"
                style={{ opacity: showCursor ? 1 : 0 }}
              />
            </span>
          </h2>
          <p
            className={`${bodyFont.className} mt-3 text-base sm:text-lg lg:text-xl leading-7 sm:leading-8 max-w-sm`}
          >
            Positive experiences from users who have benefited from therapy or
            wellness programs.
          </p>

          <div className="mt-8 flex items-center gap-4">
            <button
              type="button"
              onClick={handlePrev}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white text-[#00373E] shadow-sm hover:bg-gray-50 transition-colors"
              aria-label="Previous testimonial"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00373E] text-white shadow-md hover:bg-[#024a53] transition-colors"
              aria-label="Next testimonial"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Right column: two testimonial cards */}
        <div className="flex w-full flex-1 flex-col sm:flex-row items-stretch gap-4 sm:gap-6">
          {visible.map((item, i) => {
            const bgStyle = i === 0
              ? "bg-[#FFE7CC] text-[#00373E]"
              : "bg-[#00373E] text-white";
            return (
              <div
                key={i}
                className={`flex flex-1 flex-col justify-between rounded-[32px] sm:rounded-[60px] p-6 sm:pt-16 sm:pl-16 sm:pr-8 sm:pb-8 shadow-sm h-[240px] sm:h-[393px] overflow-hidden ${bgStyle}`}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${index}-${i}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col justify-between h-full"
                  >
                    <p
                      className={`${bodyFont.className} mb-6 text-sm sm:text-base leading-relaxed sm:leading-7 font-normal`}
                    >
                      {item.quote}
                    </p>
                    {item.author && (
                      <p className="text-xs sm:text-sm font-semibold opacity-80">
                        {item.author}
                      </p>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Every testimonial that is not currently on a card.

            The carousel shows two at a time, so only two of the thirty ever
            reached the HTML — the other twenty-eight were real social proof
            that no crawler and no answer engine could see. Rendering the rest
            here puts all thirty in the document without changing what anyone
            looks at: it is display:none, not off-screen text, and it holds
            exactly the testimonials the visible cards do not, so nothing is
            duplicated. Readers still reach them through the arrows. */}
        <ul hidden aria-hidden="true">
          {testimonials
            .filter((item) => !visible.includes(item))
            .map((item) => (
              <li key={item.quote}>
                <p>{item.quote}</p>
                {item.author && <p>{item.author}</p>}
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
}


