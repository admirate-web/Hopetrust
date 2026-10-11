import type { Faq } from '@/lib/faqs';

/**
 * Specialty landing pages: one page per thing people actually search for and
 * Hope Trust actually does, where no page existed to answer the search.
 *
 * Each exists because Search Console showed the demand already reaching the
 * site and landing on a page that only mentioned the topic in passing — couples
 * counselling queries on /mental-health/ at position ~10, "child psychologist
 * hyderabad" on the therapist directory at ~16, "ocd treatment in hyderabad" on
 * the homepage at ~40, "online therapy" on a 2019 blog post at ~30.
 *
 * Accuracy rules, because this is health content:
 *  - Services described are ones the site already states (the tabs and
 *    carousel on /mental-health/, the programme cards on /addiction/, the
 *    booking steps on the homepage). General clinical information — what OCD
 *    is, what ERP involves — is standard, guideline-level material, phrased
 *    without promising outcomes.
 *  - Nothing about fees, session counts or outcomes is invented.
 *
 * The images under /images/services/ are AI-generated illustrations, not
 * photographs of Hope Trust, its staff or its clients.
 *
 * Clinical staff should read a page before it goes live and after any edit.
 */

/** An image shown beside a section. Paths are under public/. */
export type SpecialtyImage = { src: string; alt: string };

export type SpecialtySection = (
  | { kind: 'text'; heading: string; paragraphs: string[] }
  | { kind: 'list'; heading: string; intro?: string; items: string[]; outro?: string }
  | { kind: 'steps'; heading: string; intro?: string; steps: { title: string; body: string }[] }
  | { kind: 'cards'; heading: string; intro?: string; cards: { title: string; body: string }[] }
) & { image?: SpecialtyImage };

export type Specialty = {
  /** Route segment, and the key other modules link by. */
  slug: string;
  /** Short name for breadcrumbs, navigation and cross-links. */
  name: string;
  /** <title> before the " | Hope Trust" suffix. Keep the whole title under ~62 characters. */
  metaTitle: string;
  /** 140–160 characters. */
  metaDescription: string;
  eyebrow: string;
  /** The page's <h1>: the hero's display line, set in capitals like the other service pages. */
  heroTitle: string;
  /** Short topics shown under the heading, as on the Mental Health hero. */
  heroTags: string[];
  heroImage: SpecialtyImage;
  /**
   * The answer-first opening paragraph. Written to stand on its own: it is the
   * passage most likely to be lifted into a featured snippet or an AI answer,
   * so it names the service, where it is offered and how, in plain words.
   */
  lede: string;
  sections: SpecialtySection[];
  /** Closing call to action: who to book, or how to choose. */
  cta: { heading: string; body: string };
  faqs: Faq[];
  related: { label: string; href: string }[];
  /** schema.org MedicalTherapy.serviceType */
  serviceType: string;
  /** Optional schema.org node the page is about, e.g. a MedicalCondition. */
  about?: Record<string, unknown>;
};

const BOOK = 'Choose a practitioner on our therapists page and book through their profile, or call +91 9000850001 (Monday to Saturday, 10 AM to 7 PM IST).';

export const SPECIALTIES: Specialty[] = [
  {
    slug: 'couples-counselling',
    name: 'Couples & marriage counselling',
    metaTitle: 'Couples & Marriage Counselling in Hyderabad',
    metaDescription:
      'Couples and marriage counselling in Banjara Hills, Hyderabad and online. Work on communication, conflict and trust with Hope Trust’s relationship therapists.',
    eyebrow: 'Relationships',
    heroTitle: 'Couples Counselling',
    heroTags: ['Communication', 'Trust', 'Intimacy', 'Family pressure'],
    heroImage: {
      src: '/images/services/couples-hero.webp',
      alt: 'Two trees on a hillside at sunrise, their branches reaching towards each other',
    },
    lede:
      'Couples counselling gives two people a structured space to work on what keeps going wrong between them — communication, conflict, trust, intimacy, family pressure — with a therapist who takes neither side. At Hope Trust it is offered in person at our centre in Banjara Hills, Hyderabad, and online, for married and unmarried couples, including LGBTQ+ couples.',
    sections: [
      {
        kind: 'list',
        heading: 'What couples counselling can help with',
        image: {
          src: '/images/services/couples-session.webp',
          alt: 'A couple talking with each other during a counselling session',
        },
        items: [
          'Communication that keeps breaking down',
          'The same arguments coming back again and again',
          'Rebuilding trust',
          'Intimacy and emotional distance',
          'Pressure from parents, in-laws and extended family',
          'Differing values, and decisions you cannot agree on',
          'The strain of work, illness or caring for someone',
          'Disagreements about parenting',
          'A partner’s drinking, drug use or gambling',
        ],
      },
      {
        kind: 'steps',
        heading: 'How couples counselling works at Hope Trust',
        intro: 'Sessions follow three stages, so that each of you is heard alone as well as together.',
        steps: [
          {
            title: 'A first session together',
            body: 'You meet the therapist as a couple, describe what brought you in, and agree on what you each want to change. Nothing is decided for you.',
          },
          {
            title: 'Time with each partner alone',
            body: 'Each of you has individual space with the therapist to say what may be hard to say in the room together.',
          },
          {
            title: 'Joint sessions',
            body: 'Most of the work then happens together: practising new ways of talking and listening, working through specific conflicts, and rebuilding connection at a pace that suits you both.',
          },
        ],
      },
      {
        kind: 'cards',
        heading: 'Approaches our therapists use',
        intro: 'Different couples need different methods. Our relationship therapists work with one or more of these.',
        cards: [
          {
            title: 'Emotionally Focused Therapy (EFT)',
            body: 'Looks beneath repeated fights to the emotional cycle driving them, and helps partners respond to each other’s underlying needs rather than to the argument on the surface.',
          },
          {
            title: 'Imago Relationship Therapy',
            body: 'Uses a structured dialogue — repeating back, validating, empathising — so that each partner feels heard before they respond.',
          },
          {
            title: 'Cognitive Behaviour Therapy (CBT)',
            body: 'Works on the thoughts and habits that fuel conflict, and on practical communication and problem-solving skills you can use between sessions.',
          },
        ],
      },
      {
        kind: 'text',
        heading: 'When to consider couples counselling',
        paragraphs: [
          'Many couples wait until the relationship feels close to breaking. You do not need to. Counselling is often most useful earlier: when the same argument keeps returning, when one of you has stopped raising things because it never goes well, or after a big change such as a move, a new baby, a job loss or a bereavement. It can also help couples who are trying to decide whether to stay together.',
          'If you feel unsafe with your partner, joint sessions are not the right first step. Book an individual session instead, and in an emergency contact local emergency services (112 in India).',
        ],
      },
    ],
    cta: {
      heading: 'Take the first step together.',
      body: 'Choose a relationship therapist and book a joint session, in person in Banjara Hills or online.',
    },
    faqs: [
      {
        question: 'Do both partners have to attend couples counselling?',
        answer:
          'It works best when both of you take part, and the process includes joint sessions as well as time with each partner alone. If your partner is not ready, you can start on your own — individual sessions can still change how you handle the relationship.',
      },
      {
        question: 'Is couples counselling only for married couples?',
        answer:
          'No. It is for any two people in a committed relationship — married, engaged, living together or dating — and our therapists work with LGBTQ+ couples as well as heterosexual couples.',
      },
      {
        question: 'Will the therapist take sides?',
        answer:
          'No. The therapist’s job is to help both of you be heard and understood, not to decide who is right. Individual sessions with each partner are part of the process precisely so that neither of you feels outnumbered.',
      },
      {
        question: 'Can we have couples counselling online?',
        answer:
          'Yes. Sessions can be held online over a private video link, or in person at our centre in Banjara Hills, Hyderabad.',
      },
      {
        question: 'Is what we say confidential?',
        answer:
          'Yes. What you discuss stays between you and your therapist. Your therapist will explain at the start how confidentiality works, including the narrow circumstances in which it does not apply.',
      },
      {
        question: 'Can counselling help if one of us has a drinking or addiction problem?',
        answer:
          'Yes. Hope Trust has worked with addiction and its effect on families since 2002. Couples or family sessions can run alongside addiction treatment, and our intervention service helps families when someone is not yet ready to accept help.',
      },
      {
        question: 'How do we book?',
        answer: BOOK,
      },
    ],
    related: [
      { label: 'Mental health services', href: '/mental-health/' },
      { label: 'Online therapy', href: '/online-therapy/' },
      { label: 'Intervention for a loved one', href: '/intervention-services/' },
      { label: 'All therapists', href: '/book-your-session/' },
    ],
    serviceType: 'Couples Therapy',
  },

  {
    slug: 'online-therapy',
    name: 'Online therapy',
    metaTitle: 'Online Therapy & Counselling in India',
    metaDescription:
      'Online therapy with Hope Trust’s psychologists, psychiatrist and counsellors. Private video sessions for anxiety, depression, relationships and addiction.',
    eyebrow: 'Online sessions',
    heroTitle: 'Online Therapy',
    heroTags: ['Therapy', 'Psychiatry', 'Couples', 'Addiction care'],
    heroImage: {
      src: '/images/services/online-hero.webp',
      alt: 'A quiet reading corner at home by a window at sunrise, with a laptop and a cup of tea',
    },
    lede:
      'Every Hope Trust practitioner — psychologists, our psychiatrist and our addiction counsellors — sees clients online over a private video link, as well as in person at our centre in Banjara Hills, Hyderabad. Online sessions cover the same work as in-clinic ones: therapy for anxiety, depression and relationships, addiction treatment programmes and psychiatric consultations, in English, Hindi, Telugu and several other languages.',
    sections: [
      {
        kind: 'steps',
        heading: 'How online sessions work',
        image: {
          src: '/images/services/online-session.webp',
          alt: 'A woman at home in a video session with her counsellor on a laptop',
        },
        steps: [
          {
            title: 'Choose your therapist',
            body: 'Every profile lists the practitioner’s qualifications, the concerns they work with and the languages they speak, so you can choose who you see.',
          },
          {
            title: 'Book a time',
            body: 'Book through the website or on WhatsApp, and pick a date and time that works for you.',
          },
          {
            title: 'Join from somewhere private',
            body: 'A private session link is sent to you by email or WhatsApp. Join on a phone or laptop with a steady connection, from a place where you can talk without being overheard.',
          },
        ],
      },
      {
        kind: 'list',
        heading: 'What you can get help with online',
        items: [
          'Anxiety, stress and panic',
          'Depression and low mood',
          'Obsessive-compulsive disorder (OCD)',
          'Relationship and couples concerns',
          'Grief, trauma and life transitions',
          'Student and exam stress, and career confusion',
          'Addiction recovery programmes, including family sessions',
          'Consultations with our psychiatrist',
        ],
      },
      {
        kind: 'text',
        heading: 'Is online therapy right for you?',
        paragraphs: [
          'For many people, yes. Studies comparing therapy by video with therapy in person, for concerns such as anxiety and depression, have generally found similar outcomes — and online sessions remove the commute, fit around work, and are easier to keep up while travelling.',
          'It may not be the right starting point if you are in crisis, if you have no private place to talk, or if your practitioner advises that an in-person assessment is needed first. If you or someone else is in immediate danger, contact local emergency services (112 in India).',
        ],
      },
    ],
    cta: {
      heading: 'Choose who you see.',
      body: 'Every Hope Trust practitioner sees clients online. Browse their profiles — qualifications, the concerns they work with and the languages they speak — and book directly.',
    },
    faqs: [
      {
        question: 'Is online therapy as effective as in-person therapy?',
        answer:
          'For many concerns, research comparing video and in-person therapy has found similar results, particularly for anxiety and depression. What matters most is the fit between you and your therapist, and being able to talk freely — which is why a private space for online sessions is important.',
      },
      {
        question: 'What do I need for an online session?',
        answer:
          'A phone, tablet or computer with a camera and microphone, a stable internet connection, and somewhere private where you will not be overheard. Headphones help if others are nearby.',
      },
      {
        question: 'How do I receive the link for my session?',
        answer:
          'Once your appointment is booked, a private session link is shared with you by email or WhatsApp.',
      },
      {
        question: 'Is online therapy confidential?',
        answer:
          'Yes. What you discuss stays between you and your therapist, exactly as it would in the clinic. Joining from a private room, with headphones if needed, keeps it confidential on your side too.',
      },
      {
        question: 'Can family members join an online session?',
        answer:
          'Where it is part of the work, yes. Family sessions are built into our addiction recovery programmes, and couples counselling can also be held online.',
      },
      {
        question: 'Can I see a psychiatrist online?',
        answer:
          'Yes. Consultations with our psychiatrist are available online as well as in person. Your psychiatrist will tell you if anything, such as a physical examination or tests, needs to happen in person.',
      },
      {
        question: 'How do I book an online session?',
        answer:
          'Choose a practitioner and book through their profile, message us on WhatsApp, or call +91 9000850001 (Monday to Saturday, 10 AM to 7 PM IST). Mention that you would like to meet online.',
      },
    ],
    related: [
      { label: 'All therapists', href: '/book-your-session/' },
      { label: 'Couples counselling', href: '/couples-counselling/' },
      { label: 'Addiction treatment', href: '/addiction/' },
      { label: 'Mental health services', href: '/mental-health/' },
    ],
    serviceType: 'Online Psychotherapy',
  },

  {
    slug: 'child-psychologist',
    name: 'Child & adolescent psychology',
    metaTitle: 'Child & Adolescent Psychologists in Hyderabad',
    metaDescription:
      'Child and teen psychologists in Banjara Hills, Hyderabad: anxiety, behaviour, ADHD testing, exam stress and family therapy. In-clinic and online sessions.',
    eyebrow: 'Children & teenagers',
    heroTitle: 'Child Psychologists',
    heroTags: ['Anxiety', 'Behaviour', 'ADHD testing', 'Exam stress'],
    heroImage: {
      src: '/images/services/child-hero.webp',
      alt: 'A colourful kite flying over a meadow of wildflowers at golden hour',
    },
    lede:
      'Hope Trust’s psychologists work with children, teenagers and students — and with their parents — on anxiety, low mood, behaviour, attention, exam stress and the pressures of growing up. Sessions take place at our centre in Banjara Hills, Hyderabad, and online, and include ADHD assessments and psychological testing.',
    sections: [
      {
        kind: 'list',
        heading: 'Signs a child or teenager may need support',
        intro: 'Every child has difficult phases. It is worth talking to someone when a change lasts for weeks, or gets in the way of school, friendships or family life:',
        items: [
          'Worries, fears or panic that stop them doing ordinary things',
          'Persistent sadness, irritability or withdrawal from friends',
          'Changes in sleep, eating or school performance',
          'Anger or behaviour that is hard to manage at home or at school',
          'Difficulty concentrating, sitting still or finishing tasks',
          'Exam stress, or anxiety about results and career choices',
          'Repetitive habits or rituals they feel they must do',
        ],
        outro: 'If a child talks about not wanting to live, or you see signs of self-harm, seek help the same day — and in an emergency contact local emergency services (112 in India).',
      },
      {
        kind: 'cards',
        heading: 'How we help',
        intro:
          'Support is matched to the child’s age and to what is going on — from a first assessment to therapy, testing, and work with the whole family. Sessions take place at our centre in Banjara Hills or online.',
        image: {
          src: '/images/services/child-session.webp',
          alt: 'A psychologist drawing with a young child while a parent looks on',
        },
        cards: [
          {
            title: 'Therapy for children and teenagers',
            body: 'Talking and play-based therapies matched to the child’s age, for anxiety, low mood, behaviour, self-esteem and adjustment to change.',
          },
          {
            title: 'ADHD testing',
            body: 'A structured, easy-to-follow evaluation, a clear explanation of the results and what they mean for day-to-day life, and a calm discussion of next steps.',
          },
          {
            title: 'Psychological assessment',
            body: 'Standardised psychometric tests that help clarify what is going on before a plan is made.',
          },
          {
            title: 'Student mental health',
            body: 'Support for school, college and university students with stress, exams and change — including career counselling to explore strengths and plan next steps.',
          },
          {
            title: 'Family therapy',
            body: 'Sessions with parents and siblings for misunderstandings, repeated arguments, generational gaps and parent–child communication.',
          },
        ],
      },
      {
        kind: 'steps',
        heading: 'What happens when you book',
        steps: [
          {
            title: 'Tell us what you are noticing',
            body: 'A parent or guardian usually makes the first contact, and can describe the concern before the child is seen.',
          },
          {
            title: 'Assessment',
            body: 'The psychologist meets your child, and you, to understand what is happening. Where it helps, this includes structured tests such as an ADHD evaluation.',
          },
          {
            title: 'A plan you understand',
            body: 'You get a clear explanation of what was found and what is recommended. Parents and caregivers are included in the work when that helps the child.',
          },
        ],
      },
    ],
    cta: {
      heading: 'You do not have to work it out alone.',
      body: 'Book a first session with one of our psychologists — or start with a session for yourself as a parent.',
    },
    faqs: [
      {
        question: 'Which age groups do your psychologists see?',
        answer:
          'Our psychologists work with children, teenagers and students at school, college and university. Each practitioner’s profile on our therapists page describes the concerns they work with; if you are unsure who to book, call us and describe what is happening.',
      },
      {
        question: 'Will I be involved in my child’s sessions?',
        answer:
          'Usually, yes. Parents and caregivers are included when it helps. Older teenagers often benefit from some time alone with the psychologist, who will explain at the start how information is shared with parents.',
      },
      {
        question: 'Do you do ADHD testing?',
        answer:
          'Yes. ADHD evaluations are structured and easy to follow. You receive a clear explanation of the results and what they mean for day-to-day life, and next steps are discussed so you know how to move forward.',
      },
      {
        question: 'What is the difference between a child psychologist and a child psychiatrist?',
        answer:
          'A psychologist assesses children and works through therapy and psychological testing. A psychiatrist is a medical doctor who can also prescribe medication. If medication might help, the psychologist will discuss whether a psychiatrist should be involved.',
      },
      {
        question: 'Can teenagers have sessions online?',
        answer:
          'Yes. Online sessions suit many teenagers, especially around school and college schedules, as long as they have a private place to talk.',
      },
      {
        question: 'My teenager does not want to come. What can we do?',
        answer:
          'That is common. A parent can book a session alone first to talk through what is happening and how to approach it, and many teenagers find it easier to agree once they know what a session is actually like.',
      },
      {
        question: 'How do we book?',
        answer: BOOK,
      },
    ],
    related: [
      { label: 'Mental health services', href: '/mental-health/' },
      { label: 'OCD treatment', href: '/ocd-treatment/' },
      { label: 'Online therapy', href: '/online-therapy/' },
      { label: 'All therapists', href: '/book-your-session/' },
    ],
    serviceType: 'Child and Adolescent Psychology',
  },

  {
    slug: 'ocd-treatment',
    name: 'OCD treatment',
    metaTitle: 'OCD Treatment in Hyderabad with ERP Therapy',
    metaDescription:
      'OCD treatment in Hyderabad: CBT with exposure and response prevention (ERP) from clinical psychologists, and psychiatric care. In-clinic or online sessions.',
    eyebrow: 'Obsessive-compulsive disorder',
    heroTitle: 'OCD Treatment',
    heroTags: ['Assessment', 'CBT & ERP', 'Psychiatry', 'Family support'],
    heroImage: {
      src: '/images/services/ocd-hero.webp',
      alt: 'Morning light breaking through lifting fog over a still lake',
    },
    lede:
      'Obsessive-compulsive disorder (OCD) is treatable. The psychological treatment with the strongest evidence is cognitive behaviour therapy that includes exposure and response prevention (ERP), sometimes alongside medication. At Hope Trust, clinical psychologists who use ERP and a psychiatrist work together, in person in Banjara Hills, Hyderabad, and online.',
    sections: [
      {
        kind: 'text',
        heading: 'What OCD is',
        image: {
          src: '/images/services/ocd-breathing.webp',
          alt: 'A man sitting calmly by a window, eyes closed, taking a slow breath',
        },
        paragraphs: [
          'OCD involves obsessions — unwanted, intrusive thoughts, images or urges that cause intense anxiety — and compulsions, the repeated actions or mental rituals done to reduce that anxiety or prevent something feared. The relief does not last, so the cycle repeats and can take up hours of the day.',
          'OCD has nothing to do with simply liking things tidy. People with OCD usually know their fears are out of proportion, which is part of what makes it so distressing — and part of why it often goes untreated for years.',
        ],
      },
      {
        kind: 'list',
        heading: 'Common forms of OCD',
        items: [
          'Contamination fears, with excessive washing or cleaning',
          'Checking — locks, switches, messages, or whether you have harmed someone',
          'A need for things to feel “just right”, symmetrical or in order',
          'Intrusive harm, sexual or religious thoughts, sometimes with mostly mental rituals',
          'Persistent doubts about a relationship, and constant reassurance-seeking',
        ],
      },
      {
        kind: 'steps',
        heading: 'How OCD is treated at Hope Trust',
        intro:
          'International guidelines, including those from the UK’s National Institute for Health and Care Excellence (NICE), recommend CBT that includes ERP, with medication considered for more severe OCD or when therapy alone is not enough.',
        steps: [
          {
            title: 'Assessment',
            body: 'A clinical psychologist assesses the obsessions and compulsions, how much of the day they take, and anything else going on, such as depression or anxiety. Standardised psychological tests may be used.',
          },
          {
            title: 'CBT with exposure and response prevention',
            body: 'Step by step, at a pace you agree with your therapist, you face the situations that trigger obsessions while resisting the compulsion — until the anxiety fades on its own and the urge loses its grip.',
          },
          {
            title: 'Medication where it helps',
            body: 'Our psychiatrist can assess whether medication would help alongside therapy. For OCD this is usually an SSRI, a type of antidepressant also used for anxiety.',
          },
          {
            title: 'Involving the family',
            body: 'OCD often pulls family members into giving reassurance or joining rituals. Family sessions help everyone respond in ways that support recovery instead of feeding the cycle.',
          },
        ],
      },
    ],
    cta: {
      heading: 'OCD is treatable. Start with an assessment.',
      body: 'Book a session with a clinical psychologist who uses ERP, in person in Banjara Hills or online.',
    },
    faqs: [
      {
        question: 'Can OCD be cured?',
        answer:
          'OCD is very treatable. Many people improve substantially with CBT and exposure and response prevention, and some become largely free of symptoms; others learn to manage it so that it no longer runs their day. Symptoms can return under stress, which is why treatment also covers how to handle setbacks.',
      },
      {
        question: 'How long does OCD treatment take?',
        answer:
          'It depends on how severe the OCD is and how long it has been present. ERP is usually delivered as a structured course over a number of months, with practice between sessions. Your therapist will give you a clearer estimate after the assessment.',
      },
      {
        question: 'Do I need medication for OCD?',
        answer:
          'Not necessarily. Therapy alone helps many people, particularly with mild to moderate OCD. Medication is usually considered when symptoms are more severe, when therapy alone is not enough, or when depression is also present. Our psychiatrist can talk this through with you.',
      },
      {
        question: 'How is OCD different from being a perfectionist or very tidy?',
        answer:
          'Liking order is not OCD. OCD involves intrusive, distressing thoughts and compulsions that take up significant time — often more than an hour a day — cause real distress, and get in the way of work, study or relationships.',
      },
      {
        question: 'Can OCD therapy be done online?',
        answer:
          'Yes. CBT and ERP can be delivered online, and much exposure practice happens at home anyway, where many triggers are. Your therapist will tell you if any part of the work is better done in person.',
      },
      {
        question: 'How can family members help someone with OCD?',
        answer:
          'Family members often end up giving reassurance or taking part in rituals out of love, which keeps the cycle going. Family sessions help everyone learn how to respond supportively without feeding the compulsions.',
      },
      {
        question: 'How do I start OCD treatment?',
        answer: BOOK,
      },
    ],
    related: [
      { label: 'Mental health services', href: '/mental-health/' },
      { label: 'Child & teen psychology', href: '/child-psychologist/' },
      { label: 'Online therapy', href: '/online-therapy/' },
      { label: 'All therapists', href: '/book-your-session/' },
    ],
    serviceType: 'Obsessive-Compulsive Disorder Treatment',
    about: {
      '@type': 'MedicalCondition',
      name: 'Obsessive-compulsive disorder',
      alternateName: 'OCD',
      possibleTreatment: [
        {
          '@type': 'PsychologicalTreatment',
          name: 'Cognitive behaviour therapy with exposure and response prevention (ERP)',
        },
        { '@type': 'DrugClass', name: 'Selective serotonin reuptake inhibitors (SSRIs)' },
      ],
    },
  },
];

export function getSpecialty(slug: string): Specialty {
  const specialty = SPECIALTIES.find((s) => s.slug === slug);
  if (!specialty) throw new Error(`Unknown specialty "${slug}"`);
  return specialty;
}
