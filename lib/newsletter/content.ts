// Shapes of a newsletter issue and its rich-text body.
//
// The body is TipTap (ProseMirror) JSON, restricted to the content allowed by
// spec §6.3. Field names match the newsletter_issues table.

export type Mark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'link'; attrs: { href: string } };

export interface TextNode {
  type: 'text';
  text: string;
  marks?: Mark[];
}

export interface HardBreakNode {
  type: 'hardBreak';
}

export type InlineNode = TextNode | HardBreakNode;

export interface ParagraphNode {
  type: 'paragraph';
  content?: InlineNode[];
}

export interface HeadingNode {
  type: 'heading';
  attrs: { level: 2 | 3 };
  content?: InlineNode[];
}

export interface BulletListNode {
  type: 'bulletList';
  content: ListItemNode[];
}

export interface OrderedListNode {
  type: 'orderedList';
  attrs?: { start?: number };
  content: ListItemNode[];
}

export interface ListItemNode {
  type: 'listItem';
  content: Array<ParagraphNode | BulletListNode | OrderedListNode>;
}

export interface BlockquoteNode {
  type: 'blockquote';
  content: ParagraphNode[];
}

export interface HorizontalRuleNode {
  type: 'horizontalRule';
}

export interface ImageNode {
  type: 'image';
  attrs: { src: string; alt?: string | null };
}

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode
  | BlockquoteNode
  | HorizontalRuleNode
  | ImageNode;

export interface BodyDoc {
  type: 'doc';
  content: BlockNode[];
}

/** The fields the email is built from. */
export interface IssueForRender {
  subject: string;
  preheader: string;
  /** YYYY-MM-DD */
  issue_date: string;
  title: string;
  hero_image_url: string | null;
  hero_image_alt: string;
  body: BodyDoc;
  /** Blog link the Share button sends; null means https://hopetrustindia.com/blogs/ */
  share_url: string | null;
}
