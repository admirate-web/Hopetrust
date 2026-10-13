// The design team's October 2026 issue (docs/design/newsletter-template-2026-10.pdf)
// as issue data, with the PDF's raw "(https://…)" links turned back into named
// links. Used by the renderer tests and scripts/newsletter-preview.mts.
// Self-contained on purpose: Node runs it directly, so no runtime imports.

import type { BlockNode, BodyDoc, InlineNode, IssueForRender, Mark } from './content';

const text = (value: string, ...marks: Mark[]): InlineNode =>
  marks.length ? { type: 'text', text: value, marks } : { type: 'text', text: value };
const link = (value: string, href: string): InlineNode => text(value, { type: 'link', attrs: { href } });
const p = (...parts: Array<string | InlineNode>): BlockNode => ({
  type: 'paragraph',
  content: parts.map((part) => (typeof part === 'string' ? text(part) : part)),
});
const h2 = (value: string): BlockNode => ({ type: 'heading', attrs: { level: 2 }, content: [text(value)] });
const h3 = (value: string): BlockNode => ({ type: 'heading', attrs: { level: 3 }, content: [text(value)] });
const quote = (value: string): BlockNode => ({ type: 'blockquote', content: [{ type: 'paragraph', content: [text(value)] }] });
const divider: BlockNode = { type: 'horizontalRule' };

export function buildSampleIssue(imagesBase: string): IssueForRender {
  const body: BodyDoc = {
    type: 'doc',
    content: [
      p('Before you can love, trust, or genuinely know another person, you must first reconcile with yourself. Every relationship in your life, including those with your parents, partner, children, and friends, is built on how you relate to yourself. As Socrates famously remarked, “Know thyself.” Two words that hold a lifetime of work.'),
      p('The Oracle of Delphi’s message was meant as a practical guideline, not a puzzle. It asks: How can you handle life well if you don’t understand your own thoughts, emotions, and desires? If you aren’t clear on who you are, you may chase things—jobs, partners, recognition—thinking they will make you happy. But even when you get them, you may still feel uneasy.'),
      h2('You are a River, not a Rock'),
      p('We often think ‘knowing ourselves’ means having a fixed label for who we are. But we are always changing, like a river that moves and forms new paths over time. What you wanted when you were younger may not be what you want now. What impressed you before may no longer interest you.'),
      p('The poet Walt Whitman stated, “I am large, and I contain multitudes.” What a comfort to be able to change and outgrow past versions of yourself without having to apologise. Growth does not imply betraying who you were; rather, it means honouring who you are becoming.'),
      p('It takes strength to accept change. People often define themselves early in life and hold tight to those ideas. We say, ‘I’m this kind of person,’ as if it’s permanent. But clinging too firmly to a fixed identity can stop personal growth. Being honest with yourself—about what helps, what doesn’t, your fears, and your true wants—is key to wisdom.'),
      p(link('Carl Rogers', 'https://en.wikipedia.org/wiki/Carl_Rogers'), ', a psychologist, stated, “The curious paradox is that when I accept myself just as I am, then I can change.” Acceptance is not apathy; rather, it provides a rich foundation for growth.'),
      h2('Listening to Yourself—Without the Static'),
      p('Getting to know yourself does not require constant reflection or overanalysis. (That way lies madness—and possibly a headache.) It is more about being tuned in. You can’t comprehend what’s truly happening within if you’re always scanning, rushing, or numbing. Silence, alone, and reflection are underappreciated kinds of self-care.'),
      p('Buddhists refer to this as ‘', link('mindfulness', 'https://www.verywellmind.com/mindfulness-the-health-and-stress-relief-benefits-3145189'), '’, or the practice of monitoring one’s thoughts and emotions without judgement. It’s not about repressing them; it’s about recognising them, like clouds flowing across the sky. When you leave a short gap between feeling and reaction, you give yourself the freedom to choose. That’s where maturity exists.'),
      p('The Bhagavad Gita addresses this nicely. Krishna teaches Arjuna that wisdom lies in self-mastery, or in learning to act from awareness rather than impulse. You do not need to become a monk to realise this. You simply need to pause before you lash out, agree to something your intuition says no to, or reach for your third cup of coffee because you’re stressed and exhausted but claiming to be alright.'),
      quote('“I am large, & I contain multitudes.”'),
      p('This self-awareness is not selfish. It’s self-respect. It says, “My inner world matters. I want to understand it so I can live with clarity, not confusion.”'),
      divider,
      h2('Face the Inner Shadows'),
      p('Self-awareness is sometimes uncomfortable. You will notice feelings like envy, defensiveness, or self-sabotage. ', link('Carl Jung', 'https://www.verywellmind.com/carl-jung-biography-archetypes-theories-beliefs-7556254'), ' called this your ‘shadow’—the parts of yourself you try not to see. He warned, “Until you make the unconscious conscious, it will direct your life, and you will call it fate.”'),
      p('That’s why the same conflicts arise in different relationships, or why you keep choosing partners who seem strangely familiar. Until you grasp your internal patterns, they will quietly dominate the show.'),
      p('But when you face these things, something powerful happens. You stop blaming others for every problem. You stop seeing yourself as a victim and begin to take charge of your own growth. In Eastern words, awakening is defined as the simple, radical act of seeing plainly, rather than a halo floating above your head. The Buddha remarked, “Peace comes from within. Do not seek it without.” The barriers to peace aren’t out there; they’re within us – in our attachments, worries, and aversion to change.'),
      p('Yes, things can get messy. Some days, the mirror shows what you’d rather ignore. But seeing your flaws doesn’t mean you are flawed—it means you are human. ', link('Rumi', 'https://en.wikipedia.org/wiki/Rumi'), ' said, “The wound is the place where the Light enters you.”'),
      h3('Humour Helps, Seriously'),
      p('If all of this sounds too serious, humour can help. Self-awareness without humour becomes self-criticism. You must be able to laugh at yourself—gently, not viciously.'),
      p('Over a century later, Oscar Wilde’s counsel remains relevant: “Be yourself; everyone else is already taken.” And comedian Lily Tomlin once observed, “I always wanted to be somebody, but now I realise I should have been more specific.”'),
      p('There’s freedom in ', link('not taking yourself too damn seriously', '/blogs/dont-take-yourself-too-damn-seriously/'), '. Growth doesn’t have to be grim. The more relaxed you are about your self-image, the easier it is to change. A little self-deprecating humour shows you’re comfortable enough to admit your flaws.'),
    ],
  };

  return {
    subject: 'The most important connection you can have',
    preheader: 'Before you can love, trust, or genuinely know another person, you must first reconcile with yourself.',
    issue_date: '2026-10-13',
    title: 'The Most Important Connection You Can Have: With Yourself',
    hero_image_url: `${imagesBase}/static/sample-hero-2026-10.jpg`,
    hero_image_alt: 'A young person talking with a counsellor in a bright living room',
    body,
    share_url: 'https://hopetrustindia.com/blogs/the-most-important-connection-you-can-have-with-yourself/',
  };
}
