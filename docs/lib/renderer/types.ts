import type { DocNode } from '../types'
import type React from 'react'

export interface RendererComponentProps<N extends DocNode = DocNode> {
  node: N
  children?: React.ReactNode
  components?: ComponentMap
}

export type ComponentMap = Record<
  string,
  React.ComponentType<RendererComponentProps<any>>
>
