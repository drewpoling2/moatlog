import type { DocNode } from '../types'
import type { ComponentMap } from './types'

export interface StructuredRendererProps {
  nodes: DocNode[]
  components: ComponentMap
}

export function StructuredRenderer({ nodes, components }: StructuredRendererProps) {
  const renderNodes = (ns: DocNode[] | undefined) =>
    (ns ?? []).map((node, i) => renderNode(node, i))

  const renderNode = (node: DocNode, key: number) => {
    const type = node.type
    if (!type) return null

    const Comp = components[type]
    if (!Comp) return null

    const n = node as { content?: DocNode[]; children?: DocNode[] }
    const nested = n.content ?? n.children
    const children = Array.isArray(nested) ? renderNodes(nested) : undefined

    return (
      <Comp key={key} node={node}>
        {children}
      </Comp>
    )
  }

  return <>{renderNodes(nodes)}</>
}
