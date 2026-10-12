import type { BlogPostMeta } from '@/lib/blog';

/**
 * What a post is about, and which service page that makes relevant.
 *
 * The archive's own metadata cannot answer this: 373 of 395 posts sit in a
 * category literally called "Blog", and not one post carries a tag. So topic is
 * derived from the words in the title and slug, which the WordPress import did
 * preserve.
 *
 * This drives two things — the call to action at the foot of a post, and part
 * of the related-posts score. Both are navigation, so a wrong guess costs a
 * reader one irrelevant link rather than misinforming them.
 */
export type Topic = {
  id: string;
  /** Heading shown above the call to action. */
  heading: string;
  /** One line explaining what the linked service actually is. */
  blurb: string;
  /** The service page this topic should send readers to. */
  href: string;
  /** Link text for the service page. */
  cta: string;
  /** Lower-case substrings that indicate this topic. */
  match: string[];
};

/**
 * Order matters: the first topic that matches wins. Addiction and intervention
 * come before the general mental-health catch-all because a post about helping
 * a drinking relative is better served by the intervention page than by a
 * generic therapy page.
 */
export const TOPICS: Topic[] = [
  {
    id: 'intervention',
    heading: 'Worried about someone else?',
    blurb:
      'A professional intervention gives families a structured, non-confrontational way to help someone accept treatment.',
    href: '/intervention-services/',
    cta: 'Read about intervention services',
    match: [
      'intervention',
      'help a loved one',
      'loved one',
      'family member',
      'refuses help',
      'get the help they need',
      'convince',
      'enabling',
      'codependen',
    ],
  },
  {
    id: 'addiction',
    heading: 'Support for addiction and recovery',
    blurb:
      'Hope Trust has run outpatient and online addiction treatment in Hyderabad since 2002, covering alcohol, drugs, nicotine and behavioural addiction.',
    href: '/addiction/',
    cta: 'Explore addiction recovery services',
    match: [
      'addict',
      'alcohol',
      'alcoholic',
      'alcoholism',
      'drink',
      'drug',
      'substance',
      'rehab',
      'sober',
      'sobriety',
      'recovery',
      'relapse',
      'withdrawal',
      'detox',
      'nicotine',
      'smoking',
      'tobacco',
      'gambling',
      'cannabis',
      'marijuana',
      'heroin',
      'cocaine',
      'opioid',
      'caffeine',
      '12-step',
      '12 step',
      'aa ',
      'dual diagnosis',
    ],
  },
  {
    id: 'corporate',
    heading: 'Mental health at work',
    blurb:
      'Hope Trust runs employee wellbeing programmes, workshops and structured workplace support for organisations.',
    href: '/corporate-wellness/',
    cta: 'See corporate wellness programmes',
    match: [
      'workplace',
      'employee',
      'corporate',
      'at work',
      'career',
      'colleague',
      'job ',
      'office',
      'burnout',
      'work-life',
      'work life',
    ],
  },
  {
    id: 'training',
    heading: 'Training in counselling',
    blurb:
      'Hope Trust offers professional training and certification in mental health and addiction counselling.',
    href: '/training/',
    cta: 'View training programmes',
    match: ['training', 'certification', 'internship', 'become a counsellor', 'become a therapist'],
  },
  // The specialty topics sit after addiction and work, so "addiction and
  // relationships" still goes to addiction and "burnout at work" to corporate,
  // and before the catch-all, so a relationship post reaches the couples page
  // rather than the general one. Online comes first among them: a post about
  // online therapy is about the format whatever the concern.
  {
    id: 'online',
    heading: 'Prefer to talk online?',
    blurb:
      'Every Hope Trust practitioner sees clients online over a private video link, as well as in person in Hyderabad.',
    href: '/online-therapy/',
    cta: 'How online therapy works',
    match: ['online', 'teletherapy', 'tele-therapy', 'virtual therapy', 'video call'],
  },
  {
    id: 'couples',
    heading: 'Working through this as a couple',
    blurb:
      'Hope Trust offers couples and marriage counselling in Hyderabad and online, for communication, conflict, trust and family pressure.',
    href: '/couples-counselling/',
    cta: 'Explore couples counselling',
    match: [
      'couple',
      'marriage',
      'marital',
      'married',
      'divorce',
      'spouse',
      'partner',
      'relationship',
      'infidelity',
      'betrayal',
      'love',
      'dating',
      'breakup',
      'break-up',
      'heartbreak',
      'intimacy',
    ],
  },
  {
    id: 'child',
    heading: 'Support for children and teenagers',
    blurb:
      'Hope Trust’s psychologists work with children, teenagers and students, and their parents — including ADHD testing and exam stress.',
    href: '/child-psychologist/',
    cta: 'See child & teen psychology',
    match: ['child', 'teen', 'adolescen', 'parenting', 'kids', 'student', 'exam', 'adhd'],
  },
  {
    id: 'ocd',
    heading: 'Help with OCD',
    blurb:
      'Hope Trust treats OCD with CBT and exposure and response prevention (ERP), alongside psychiatric care where it helps.',
    href: '/ocd-treatment/',
    cta: 'Read about OCD treatment',
    match: ['ocd', 'obsessive', 'intrusive thought'],
  },
  {
    id: 'mental-health',
    heading: 'Talk to someone about this',
    blurb:
      'Hope Trust provides therapy, psychiatry, and couples and family therapy for anxiety, depression, trauma, ADHD, OCD and grief.',
    href: '/mental-health/',
    cta: 'Explore mental health services',
    match: [], // catch-all
  },
];

const FALLBACK = TOPICS[TOPICS.length - 1];

export function topicFor(post: Pick<BlogPostMeta, 'title' | 'slug'>): Topic {
  const haystack = `${post.title} ${post.slug.replace(/-/g, ' ')}`.toLowerCase();
  return (
    TOPICS.find((t) => t.match.length > 0 && t.match.some((m) => haystack.includes(m))) ??
    FALLBACK
  );
}

/** Words too common to say anything about what a post is about. */
const STOPWORDS = new Set(
  ('a an and are as at be but by can do does for from get go had has have how i if in into is it its ' +
    'may more most no not of on or our out so than that the their them then there these they this to ' +
    'up us was we what when where which who why will with you your yours about after all also any ' +
    'because been before being between both during each few his her him she he them those through ' +
    'under very while would could should did done just like make making need needs new now one only ' +
    'other over own same some such take taking things think ways way top best help helps')
    .split(' ')
);

function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  );
}

/**
 * Posts most worth reading next.
 *
 * Scored on shared title keywords, with a bonus for sharing a topic, so a post
 * about relapse leads to other posts about relapse rather than to whatever
 * happens to be adjacent by date. Falls back to same-topic posts when a title
 * shares no distinctive words with anything, which keeps every post linked to
 * something rather than showing an empty module.
 */
export function relatedPosts(
  current: BlogPostMeta,
  all: BlogPostMeta[],
  limit = 3
): BlogPostMeta[] {
  const currentTopic = topicFor(current);
  const currentWords = keywords(current.title);

  const scored = all
    .filter((p) => p.slug !== current.slug)
    .map((p) => {
      const shared = Array.from(keywords(p.title)).filter((w) => currentWords.has(w))
        .length;
      const sameTopic = topicFor(p).id === currentTopic.id ? 1 : 0;
      return { post: p, score: shared * 3 + sameTopic };
    })
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.post.date).getTime() - new Date(a.post.date).getTime()
    );

  return scored.slice(0, limit).map((s) => s.post);
}
