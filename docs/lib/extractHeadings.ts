import type { DocNode, HeadingNode, StepNode, TabsNode } from './types'
import { slugify } from './slugify'

export interface TocHeading {
  level: number
  text: string
  id: string
}

function isHeading(node: DocNode): node is HeadingNode {
  return node.type === 'heading' && typeof (node as HeadingNode).level === 'number'
}

function isStep(node: DocNode): node is StepNode {
  return node.type === 'step' && typeof (node as StepNode).title === 'string'
}

function isTabs(node: DocNode): node is TabsNode {
  return node.type === 'tabs' && Array.isArray((node as TabsNode).items)
}

function childNodes(node: DocNode): DocNode[] {
  if (isTabs(node)) {
    return node.items.flatMap((item) => item.content ?? [])
  }

  if ('content' in node && Array.isArray(node.content)) {
    return node.content
  }

  return []
}

function collectHeadings(nodes: DocNode[], headings: TocHeading[]): void {
  for (const node of nodes) {
    if (isHeading(node) && node.level >= 2) {
      headings.push({
        level: node.level,
        text: node.text,
        id: slugify(node.text),
      })
    } else if (isStep(node)) {
      headings.push({
        level: 3,
        text: node.title,
        id: slugify(node.title),
      })
    }

    collectHeadings(childNodes(node), headings)
  }
}

export function extractHeadings(content: DocNode[]): TocHeading[] {
  const headings: TocHeading[] = []
  collectHeadings(content, headings)
  return headings
}
