import { useState } from 'react'
import type { SceneNode } from '../../domain/nodes/SceneNode.ts'
import type { NodeId } from '../../domain/scene/ids.ts'
import { useEditorStore } from '../../state/useEditorStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'

const KIND_GLYPH: Record<SceneNode['kind'], string> = {
  group: '▦',
  mesh: '◈',
  light: '☀',
  camera: '▷',
}

export function SceneTree() {
  const nodes = useProjectStore((s) => s.project.scene.nodes)
  const rootIds = useProjectStore((s) => s.project.scene.rootIds)
  const rename = useProjectStore((s) => s.rename)
  const setVisible = useProjectStore((s) => s.setVisible)
  const removeNode = useProjectStore((s) => s.removeNode)
  const reparent = useProjectStore((s) => s.reparent)

  const selectedId = useEditorStore((s) => s.selectedId)
  const select = useEditorStore((s) => s.select)

  const [collapsed, setCollapsed] = useState<Set<NodeId>>(new Set())
  const [editing, setEditing] = useState<NodeId | null>(null)

  const toggleCollapse = (id: NodeId) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const renderNode = (id: NodeId, depth: number) => {
    const node = nodes[id]
    if (!node) return null
    const hasChildren = node.childrenIds.length > 0
    const isCollapsed = collapsed.has(id)

    return (
      <div key={id}>
        <div
          className={`tree-node${selectedId === id ? ' selected' : ''}`}
          style={{ paddingLeft: depth * 12 + 4 }}
          draggable
          onClick={() => select(id)}
          onDragStart={(e) => e.dataTransfer.setData('text/node', id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const dragged = e.dataTransfer.getData('text/node') as NodeId
            if (dragged && dragged !== id) reparent(dragged, id)
          }}
        >
          <span
            className="twirl"
            onClick={(e) => {
              e.stopPropagation()
              if (hasChildren) toggleCollapse(id)
            }}
          >
            {hasChildren ? (isCollapsed ? '▸' : '▾') : ''}
          </span>
          <span className="kind">{KIND_GLYPH[node.kind]}</span>
          {editing === id ? (
            <input
              autoFocus
              defaultValue={node.name}
              onBlur={(e) => {
                rename(id, e.target.value || node.name)
                setEditing(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditing(null)
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="name" onDoubleClick={() => setEditing(id)}>
              {node.name}
            </span>
          )}
          <span
            className="vis"
            title="Видимость"
            onClick={(e) => {
              e.stopPropagation()
              setVisible(id, !node.visible)
            }}
          >
            {node.visible ? '👁' : '–'}
          </span>
          <span
            className="vis"
            title="Удалить"
            onClick={(e) => {
              e.stopPropagation()
              if (selectedId === id) select(null)
              removeNode(id)
            }}
          >
            ✕
          </span>
        </div>
        {hasChildren &&
          !isCollapsed &&
          node.childrenIds.map((cid) => renderNode(cid, depth + 1))}
      </div>
    )
  }

  return rootIds.length === 0 ? (
    <p className="hint">
      Пусто. Импортируйте модель (Файл → Импорт) или добавьте примитив (Добавить →
      Примитив).
    </p>
  ) : (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const dragged = e.dataTransfer.getData('text/node') as NodeId
        if (dragged) reparent(dragged, null)
      }}
    >
      {rootIds.map((id) => renderNode(id, 0))}
    </div>
  )
}
