export interface DocPage {
  title: string
  slug: string
  content: DocNode[]
}

export type InlineNode =
  | TextNode
  | InlineCodeNode
  | LinkNode
  | StrongNode
  | EmphasisNode

export type DocNode =
  | HeadingNode
  | ParagraphNode
  | CodeNode
  | CalloutNode
  | ListNode
  | ListItemNode
  | BlockquoteNode
  | HrNode
  | ImageNode
  | TableNode
  | StepNode
  | TabsNode
  | CommandNode
  | CardGridNode
  | CardNode
  | InlineNode
  | (Record<string, unknown> & { type: string })

export interface HeadingNode {
  type: 'heading'
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
}

export interface ParagraphNode {
  type: 'paragraph'
  text?: string
  content?: DocNode[]
}

export interface TextNode {
  type: 'text'
  value: string
}

export interface InlineCodeNode {
  type: 'inlineCode'
  value: string
}

export interface LinkNode {
  type: 'link'
  url: string
  external?: boolean
  content?: DocNode[]
}

export interface StrongNode {
  type: 'strong'
  content?: DocNode[]
}

export interface EmphasisNode {
  type: 'emphasis'
  content?: DocNode[]
}

export interface ListNode {
  type: 'list'
  ordered: boolean
  content?: DocNode[]
}

export interface ListItemNode {
  type: 'listItem'
  content?: DocNode[]
}

export interface BlockquoteNode {
  type: 'blockquote'
  content?: DocNode[]
}

export interface HrNode {
  type: 'hr'
}

export interface ImageNode {
  type: 'image'
  src: string
  alt: string
  width?: number
  height?: number
}

export interface TableNode {
  type: 'table'
  header?: DocNode[][]
  rows: DocNode[][][]
}

export interface CodeNode {
  type: 'code'
  language: string
  code: string
}

export interface CalloutNode {
  type: 'callout'
  variant: 'info' | 'warning' | 'success' | 'danger'
  title?: string
  text?: string
  content?: DocNode[]
}

export interface StepNode {
  type: 'step'
  number: number
  title: string
  content?: DocNode[]
}

export interface TabsNode {
  type: 'tabs'
  items: { label: string; content: DocNode[] }[]
}

export interface CommandNode {
  type: 'command'
  command: string
  description?: string
}

export interface CardGridNode {
  type: 'cardGrid'
  cols?: 2 | 3
  cards: CardNode[]
}

export interface CardNode {
  type: 'card'
  title: string
  description: string
  href: string
  icon?: string
}
