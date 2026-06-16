import NextLink from 'next/link'
import type {
  BlockquoteNode,
  CalloutNode,
  CardGridNode,
  CardNode,
  CodeNode,
  EmphasisNode,
  HeadingNode,
  ImageNode,
  InlineCodeNode,
  LinkNode,
  ListItemNode,
  ListNode,
  ParagraphNode,
  StepNode,
  StrongNode,
  TableNode,
  TabsNode,
  TextNode,
} from '../types'
import type { ComponentMap, RendererComponentProps } from './types'
import { slugify } from '../slugify'
import { StructuredRenderer } from './StructuredRenderer'
import { Tabs } from './Tabs'
import { Command } from './Command'
import { CodeBlock } from './CodeBlock'

function Heading({ node }: RendererComponentProps<HeadingNode>) {
  const level = node.level
  const id = slugify(node.text)
  if (level === 1) return <h1 id={id} className="doc-heading doc-heading-1">{node.text}</h1>
  if (level === 2) return <h2 id={id} className="doc-heading doc-heading-2">{node.text}</h2>
  if (level === 3) return <h3 id={id} className="doc-heading doc-heading-3">{node.text}</h3>
  if (level === 4) return <h4 id={id} className="doc-heading doc-heading-4">{node.text}</h4>
  if (level === 5) return <h5 id={id} className="doc-heading doc-heading-5">{node.text}</h5>
  return <h6 id={id} className="doc-heading doc-heading-6">{node.text}</h6>
}

function Paragraph({ node, children }: RendererComponentProps<ParagraphNode>) {
  return (
    <p className="doc-paragraph">
      {children ?? node.text}
    </p>
  )
}

function Text({ node }: RendererComponentProps<TextNode>) {
  return <>{node.value}</>
}

function InlineCode({ node }: RendererComponentProps<InlineCodeNode>) {
  return <code className="doc-inline-code">{node.value}</code>
}

function Link({ node, children }: RendererComponentProps<LinkNode>) {
  return (
    <a
      href={node.url}
      className="doc-link"
      target={node.external ? '_blank' : undefined}
      rel={node.external ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  )
}

function Strong({ children }: RendererComponentProps<StrongNode>) {
  return <strong className="doc-strong">{children}</strong>
}

function Emphasis({ children }: RendererComponentProps<EmphasisNode>) {
  return <em className="doc-emphasis">{children}</em>
}

function List({ node, children }: RendererComponentProps<ListNode>) {
  const Tag = node.ordered ? 'ol' : 'ul'
  return <Tag className={`doc-list ${node.ordered ? 'doc-list-ordered' : 'doc-list-unordered'}`}>{children}</Tag>
}

function ListItem({ children }: RendererComponentProps<ListItemNode>) {
  return <li className="doc-list-item">{children}</li>
}

function Blockquote({ children }: RendererComponentProps<BlockquoteNode>) {
  return <blockquote className="doc-blockquote">{children}</blockquote>
}

function Hr() {
  return <hr className="doc-hr" />
}

function Image({ node }: RendererComponentProps<ImageNode>) {
  return (
    <figure className="doc-image">
      <img
        src={node.src}
        alt={node.alt}
        width={node.width}
        height={node.height}
        className="doc-image-img"
      />
      {node.alt ? <figcaption className="doc-image-caption">{node.alt}</figcaption> : null}
    </figure>
  )
}

function Table({ node }: RendererComponentProps<TableNode>) {
  return (
    <div className="doc-table-wrap">
      <table className="doc-table">
        {node.header?.length ? (
          <thead>
            <tr>
              {node.header.map((cell, i) => (
                <th key={i} className="doc-table-cell doc-table-header">
                  <StructuredRenderer nodes={cell} components={componentMap} />
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {node.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="doc-table-cell">
                  <StructuredRenderer nodes={cell} components={componentMap} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CodeBlockRenderer({ node }: RendererComponentProps<CodeNode>) {
  return <CodeBlock node={node} />
}

function Callout({ node, children }: RendererComponentProps<CalloutNode>) {
  return (
    <aside className={`doc-callout doc-callout-${node.variant}`}>
      {node.title ? <strong className="doc-callout-title">{node.title}</strong> : null}
      {node.text ? <p>{node.text}</p> : null}
      {children}
    </aside>
  )
}

function Step({ node, children }: RendererComponentProps<StepNode>) {
  return (
    <section className="doc-step" id={slugify(node.title)}>
      <div className="doc-step-header">
        <span className="doc-step-number">{node.number}</span>
        <h3 className="doc-step-title">{node.title}</h3>
      </div>
      {children ? <div className="doc-step-content">{children}</div> : null}
    </section>
  )
}

function Card({ node }: RendererComponentProps<CardNode>) {
  return (
    <NextLink href={node.href} className="doc-card">
      {node.icon ? <span className="doc-card-icon" aria-hidden="true">{node.icon}</span> : null}
      <span className="doc-card-title">{node.title}</span>
      <span className="doc-card-description">{node.description}</span>
    </NextLink>
  )
}

function CardGrid({ node }: RendererComponentProps<CardGridNode>) {
  const cols = node.cols ?? 2
  return (
    <div className={`doc-card-grid doc-card-grid-cols-${cols}`}>
      {node.cards.map((card) => (
        <Card key={card.href} node={card} />
      ))}
    </div>
  )
}

function TabsBlock({ node }: RendererComponentProps<TabsNode>) {
  const panels = node.items.map((item, i) => (
    <StructuredRenderer key={i} nodes={item.content} components={componentMap} />
  ))
  return (
    <Tabs
      labels={node.items.map((item) => item.label)}
      panels={panels}
    />
  )
}

export const componentMap: ComponentMap = {
  heading: Heading,
  paragraph: Paragraph,
  text: Text,
  inlineCode: InlineCode,
  link: Link,
  strong: Strong,
  emphasis: Emphasis,
  list: List,
  listItem: ListItem,
  blockquote: Blockquote,
  hr: Hr,
  image: Image,
  table: Table,
  code: CodeBlockRenderer,
  callout: Callout,
  step: Step,
  tabs: TabsBlock,
  command: Command,
  cardGrid: CardGrid,
  card: Card,
}
