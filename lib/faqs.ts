/**
 * Frequently asked questions for the service pages.
 *
 * These exist for two audiences at once. A person deciding whether to call gets
 * the practical answers — cost, format, what a first session is like — without
 * having to phone and ask. A search engine or answer engine gets the same text
 * as `FAQPage` structured data, which is the format most often quoted back in
 * AI answers and long-tail results ("how much does rehab cost in Hyderabad").
 *
 * Every answer here is drawn from something the site already states: the
 * programme cards on /addiction/, the process on /intervention-services/, the
 * copy on /corporate-wellness/ and /training/, and the address and hours in
 * lib/config.ts. Nothing about price, clinical outcome, or medical practice is
 * asserted beyond that — a confident-sounding invented answer on a health site
 * is worse than no answer, and Google requires the markup to match the visible
 * text, which is why both come from this one place.
 *
 * When a programme's price or contents change on the page, change them here too.
 */

export type Faq = { question: string; answer: string };

const HOURS = 'Monday to Saturday, 10 AM to 7 PM IST';
const LOCATION = 'Banjara Hills, Hyderabad';

export const addictionFaqs: Faq[] = [
  {
    question: 'How much does addiction treatment cost at Hope Trust?',
    answer:
      'The 30 Days Recovery Program is INR 26,500 and the 30 Days Extended OP / After Care Program is INR 18,000. The Nicotine Cessation Program is INR 10,500, and the Gambling and Internet Cessation Program is INR 26,500. Any psychometric tests are charged separately, and medical tests are arranged by the client.',
  },
  {
    question: 'What is included in the 30 Days Recovery Program?',
    answer:
      'Two weekly sessions with an addiction counsellor, two sessions with the family, essential step work with a primary counsellor, two consultations with a psychiatrist, and relapse prevention strategies tailored to the individual. After-care sessions can follow and are charged separately.',
  },
  {
    question: 'Do I have to come to the clinic, or is treatment available online?',
    answer: `Both. Programmes run online and in person at our centre in ${LOCATION}, and the two can be combined if travel or work makes weekly attendance difficult.`,
  },
  {
    question: 'Can I get help for a family member who does not want treatment?',
    answer:
      'Yes. Our intervention service is designed for exactly that situation — a planned process, guided by a professional, in which close family and friends ask someone to accept help. Family sessions are also built into the recovery programmes themselves.',
  },
  {
    question: 'What happens after the 30 days end?',
    answer:
      'Most people continue with the 30 Days Extended OP / After Care Program, which focuses on relapse prevention in the early stages of recovery. It is also open to people who have just completed an inpatient programme elsewhere.',
  },
  {
    question: 'Do you treat addictions other than alcohol and drugs?',
    answer:
      'Yes. We run dedicated programmes for nicotine and tobacco, and for gambling and internet addiction. We also support other behavioural addictions including gaming, shopping, food-related issues, compulsive work and exercise.',
  },
  {
    question: 'What if there is a mental health condition alongside the addiction?',
    answer:
      'That is called dual diagnosis, and it is common. Our programmes include psychiatrist consultations so that the emotional or psychiatric concern and the addiction are treated together rather than one after the other.',
  },
  {
    question: 'How do I start?',
    answer: `Book a session through the website, or call us during working hours (${HOURS}). The first step is a conversation about what has been happening; nothing is committed to before that.`,
  },
];

export const mentalHealthFaqs: Faq[] = [
  {
    question: 'How do I know whether I need therapy?',
    answer:
      'There is no threshold you have to cross first. People come to us when something has become hard to carry alone — persistent low mood, anxiety, difficulty sleeping, grief, strain in a relationship, or simply not feeling like themselves. A first session is a conversation about what has been happening, not a commitment to a course of treatment.',
  },
  {
    question: 'Is what I say in a session confidential?',
    answer:
      'What you discuss with your therapist stays between you and your therapist. Your therapist will explain how confidentiality works, and the narrow circumstances in which it does not apply, at the start of your first session — you are welcome to ask about it before booking.',
  },
  {
    question: 'What is the difference between a psychologist and a psychiatrist?',
    answer:
      'A psychiatrist is a medical doctor and can prescribe medication. A psychologist works through talking therapies and psychological assessment. Our team includes both, and they work together where a person needs medication and therapy at the same time.',
  },
  {
    question: 'Do you offer online sessions?',
    answer: `Yes. Sessions are available online and in person at our centre in ${LOCATION}.`,
  },
  {
    question: 'Do you provide couples or family therapy?',
    answer:
      'Yes. Couples therapy can help with communication, conflict, trust, intimacy, family pressures, differing values, and the strain of work or health concerns. The aim is to help both people understand each other better and build a steadier relationship.',
  },
  {
    question: 'Do you offer LGBTQIA+ affirmative therapy?',
    answer:
      'Yes. We offer supportive and affirmative care for LGBTQIA+ individuals, including identity-related distress, stigma, coming out, relationship concerns, gender dysphoria, anxiety, depression, and the emotional weight of feeling unseen or unsupported.',
  },
  {
    question: 'Can I choose which therapist I see?',
    answer:
      'Yes. Every practitioner has a profile listing their qualifications and the areas they work in, and you can book with a specific person rather than being assigned one.',
  },
  {
    question: 'What are your timings?',
    answer: `We are open ${HOURS}. Our centre is in ${LOCATION}.`,
  },
];

/**
 * The therapist directory. Its searchers are choosing a person ("psychologist
 * in hyderabad", "therapist near me"), so these answer how choosing and
 * booking work rather than repeating what therapy is.
 */
export const bookingFaqs: Faq[] = [
  {
    question: 'How do I book a session?',
    answer:
      'Choose a practitioner and use the Book Session button on their card or profile to pick a date and time, or message us on WhatsApp. A few practitioners take bookings by phone, and their card shows the number to call. All appointments are pre-booked.',
  },
  {
    question: 'Should I see a psychologist or a psychiatrist?',
    answer:
      'A psychiatrist is a medical doctor and can prescribe medication; a psychologist works through talking therapy and psychological assessment. If you are unsure, start with a psychologist — our psychologists and psychiatrist work together, so you can be referred on if medication may help.',
  },
  {
    question: 'Can I choose which therapist I see?',
    answer:
      'Yes. Every practitioner has a profile listing their qualifications, the concerns they work with and the languages they speak, and you book with the person you choose rather than being assigned one.',
  },
  {
    question: 'Are sessions available online?',
    answer: `Yes. Every practitioner sees clients online as well as in person at our centre in ${LOCATION}. For online sessions, a private link is sent to you by email or WhatsApp.`,
  },
  {
    question: 'Where is Hope Trust, and when is it open?',
    answer:
      'Our centre is at C/o UCCHVAS Rehabilitation Center, Plot no. 564-A-36-111, Opp. Lotus Pond Road, MLA Colony, Banjara Hills, Hyderabad 500034. We are open Monday to Saturday, 10 AM to 7 PM IST, by appointment.',
  },
  {
    question: 'Is what I share in a session confidential?',
    answer:
      'Yes. What you discuss stays between you and your therapist. Your therapist will explain at the start how confidentiality works, including the narrow circumstances in which it does not apply.',
  },
];

export const interventionFaqs: Faq[] = [
  {
    question: 'What is an intervention?',
    answer:
      'An intervention is a planned process conducted by family and friends with the guidance of a professional. Loved ones describe how the addiction has affected them, and the consequences of refusing treatment are explained clearly.',
  },
  {
    question: 'How does the process work?',
    answer:
      'It begins with planning alongside Hope Trust professionals and gathering background information and treatment options. An intervention team of four to six close people is formed, the intervention is conducted, and the person is asked for an immediate decision. If they agree, treatment starts straight away.',
  },
  {
    question: 'Who should be part of the intervention team?',
    answer:
      'Four to six people who are close to the person and whose words carry weight with them. Part of the planning is deciding together who should be in the room and who should not.',
  },
  {
    question: 'What happens if they refuse?',
    answer:
      'The consequences of refusing treatment are set out in advance, as part of the planning, so that everyone is prepared and consistent. An intervention that does not end in immediate agreement can still change what happens next, and we will talk through the options with you.',
  },
  {
    question: 'Is an intervention confrontational?',
    answer:
      'It is structured precisely so that it does not become one. The professional guiding it keeps the conversation on how the addiction has affected the people in the room and on the offer of help, rather than on blame.',
  },
  {
    question: 'How do we arrange one?',
    answer: `Contact us during working hours (${HOURS}) and we will talk through the situation before anything is planned.`,
  },
];

export const corporateFaqs: Faq[] = [
  {
    question: 'What does a corporate wellness programme involve?',
    answer:
      'It varies by organisation. It can be regular sessions or workshops for teams that need continued care and guidance, or structured, confidential one-to-one support for employees over time. Each programme is shaped around the needs of the organisation.',
  },
  {
    question: 'Are employee sessions confidential from the employer?',
    answer:
      'Employee support is provided through confidential sessions. What an individual discusses is not reported back to their employer; organisations receive information about the programme, not about the people using it.',
  },
  {
    question: 'Can sessions be delivered remotely?',
    answer: `Yes. Support can be offered online or in person in Hyderabad, which makes distributed and hybrid teams straightforward to cover.`,
  },
  {
    question: 'How large does an organisation need to be?',
    answer:
      'There is no minimum. Because each programme is designed around the organisation, the shape of it changes with the size of the team rather than ruling smaller ones out.',
  },
  {
    question: 'What kinds of issues does this cover?',
    answer:
      'The same range our clinical work covers — stress, anxiety, low mood, burnout, relationship and family strain, and addiction — with the practical difference that access is arranged and paid for by the organisation.',
  },
  {
    question: 'How do we start a conversation about this?',
    answer: `Get in touch during working hours (${HOURS}) and we will talk through what your organisation needs before proposing anything.`,
  },
];

export const trainingFaqs: Faq[] = [
  {
    question: 'Who are the training programmes for?',
    answer:
      'Students and early career mental health professionals who want deeper clinical exposure, stronger foundations, and thoughtful supervision.',
  },
  {
    question: 'What is the difference between the internship and the traineeship?',
    answer:
      'Clinical internships are for undergraduate and postgraduate students building understanding in counselling, clinical psychology, and addiction care. The clinical traineeship is for postgraduates who want more advanced learning through supervised casework, assessments, and hands-on clinical experience.',
  },
  {
    question: 'How long is the traineeship?',
    answer:
      'The traineeship runs for three months and is designed for early career psychologists who are ready for more direct clinical learning.',
  },
  {
    question: 'Are the programmes online or on site?',
    answer:
      'Both options are available in different levels, with online and on-site formats depending on the programme.',
  },
  {
    question: 'Who runs the training?',
    answer:
      'Hope Trust, in partnership with AHIER. With over two decades of work in mental health and addiction care, the programmes are built to be practical, ethical, and grounded in real clinical work.',
  },
  {
    question: 'What will I actually learn?',
    answer:
      'Training here is not only theory. It covers counselling psychology, clinical psychology, and addiction-related work through classes and experiential learning, with a focus on learning how to listen, observe, understand, and respond with care.',
  },
  {
    question: 'How do I apply?',
    answer: `Get in touch through the contact page or call during working hours (${HOURS}) to ask about current intakes and fees.`,
  },
];
