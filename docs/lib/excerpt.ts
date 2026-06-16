import type { DocNode, ParagraphNode } from './types'

export function extractParagraphText(node: ParagraphNode): string {
  if (node.text) return node.text
  if (!node.content) return ''

  return node.content
    .filter((n): n is { type: 'text'; value: string } => n.type === 'text')
    .map((n) => n.value)
    .join('')
}

export function extractDocDescription(
  content: DocNode[],
  maxLength = 160
): string | null {
  for (const node of content) {
    if (node.type !== 'paragraph') continue

    const text = extractParagraphText(node as ParagraphNode).trim()
    if (!text) continue

    if (text.length <= maxLength) return text

    const truncated = text.slice(0, maxLength - 1)
    const lastSpace = truncated.lastIndexOf(' ')
    return `${lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated}…`
  }

  return null
}
