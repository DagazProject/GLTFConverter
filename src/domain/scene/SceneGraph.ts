import type { SceneNode } from '../nodes/SceneNode.ts'
import type { NodeId } from './ids.ts'

/**
 * Flat-map scene graph. Easy to mutate immutably (immer) and to render as a
 * tree in React. Hierarchy is encoded via parentId / childrenIds.
 */
export interface SceneGraph {
  nodes: Record<NodeId, SceneNode>
  rootIds: NodeId[]
}

export const emptySceneGraph = (): SceneGraph => ({ nodes: {}, rootIds: [] })

export const getChildren = (graph: SceneGraph, id: NodeId): SceneNode[] =>
  (graph.nodes[id]?.childrenIds ?? [])
    .map((cid) => graph.nodes[cid])
    .filter((n): n is SceneNode => Boolean(n))

export const getRoots = (graph: SceneGraph): SceneNode[] =>
  graph.rootIds.map((id) => graph.nodes[id]).filter((n): n is SceneNode => Boolean(n))

/** Depth-first walk over the whole graph. */
export const walk = (
  graph: SceneGraph,
  visit: (node: SceneNode, depth: number) => void,
): void => {
  const recur = (id: NodeId, depth: number) => {
    const node = graph.nodes[id]
    if (!node) return
    visit(node, depth)
    for (const childId of node.childrenIds) recur(childId, depth + 1)
  }
  for (const rootId of graph.rootIds) recur(rootId, 0)
}

/** Insert a node under parentId (or root when null). Mutates the graph in place. */
export const insertNode = (
  graph: SceneGraph,
  node: SceneNode,
  parentId: NodeId | null,
): void => {
  node.parentId = parentId
  graph.nodes[node.id] = node
  if (parentId && graph.nodes[parentId]) {
    graph.nodes[parentId].childrenIds.push(node.id)
  } else {
    graph.rootIds.push(node.id)
  }
}

/** Remove a node and its entire subtree. Returns the removed node ids. */
export const removeSubtree = (graph: SceneGraph, id: NodeId): NodeId[] => {
  const node = graph.nodes[id]
  if (!node) return []
  const removed: NodeId[] = []
  const recur = (nid: NodeId) => {
    const n = graph.nodes[nid]
    if (!n) return
    for (const cid of [...n.childrenIds]) recur(cid)
    delete graph.nodes[nid]
    removed.push(nid)
  }
  recur(id)
  // Detach from parent / roots.
  if (node.parentId && graph.nodes[node.parentId]) {
    const siblings = graph.nodes[node.parentId].childrenIds
    const i = siblings.indexOf(id)
    if (i >= 0) siblings.splice(i, 1)
  } else {
    const i = graph.rootIds.indexOf(id)
    if (i >= 0) graph.rootIds.splice(i, 1)
  }
  return removed
}

/** Re-parent a node, guarding against cycles. Mutates in place. */
export const reparentNode = (
  graph: SceneGraph,
  id: NodeId,
  newParentId: NodeId | null,
): boolean => {
  const node = graph.nodes[id]
  if (!node) return false
  if (id === newParentId) return false
  // Prevent moving a node into its own descendant.
  if (newParentId && isDescendant(graph, newParentId, id)) return false

  // Detach.
  if (node.parentId && graph.nodes[node.parentId]) {
    const siblings = graph.nodes[node.parentId].childrenIds
    const i = siblings.indexOf(id)
    if (i >= 0) siblings.splice(i, 1)
  } else {
    const i = graph.rootIds.indexOf(id)
    if (i >= 0) graph.rootIds.splice(i, 1)
  }

  // Attach.
  node.parentId = newParentId
  if (newParentId && graph.nodes[newParentId]) {
    graph.nodes[newParentId].childrenIds.push(id)
  } else {
    graph.rootIds.push(id)
  }
  return true
}

const isDescendant = (
  graph: SceneGraph,
  candidate: NodeId,
  ancestor: NodeId,
): boolean => {
  let current: NodeId | null = candidate
  while (current) {
    if (current === ancestor) return true
    current = graph.nodes[current]?.parentId ?? null
  }
  return false
}
