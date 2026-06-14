import type { ReactNode } from 'react'
import { useLayoutStore } from '../../state/useLayoutStore.ts'
import type { PanelId, Side } from '../../state/useLayoutStore.ts'
import { Icon } from '../icons/Icon.tsx'
import type { IconName } from '../icons/Icon.tsx'
import { SceneTree } from '../panels/SceneTree.tsx'
import { Inspector } from '../panels/Inspector/Inspector.tsx'
import { AssetsPanel } from '../panels/AssetsPanel.tsx'
import { UVEditor } from '../panels/UVEditor.tsx'

interface PanelDef {
  title: string
  icon: IconName
  render: () => ReactNode
}

const REGISTRY: Record<PanelId, PanelDef> = {
  scene: { title: 'Сцена', icon: 'group', render: () => <SceneTree /> },
  inspector: { title: 'Инспектор', icon: 'object', render: () => <Inspector /> },
  assets: { title: 'Материалы и текстуры', icon: 'material', render: () => <AssetsPanel /> },
  uv: { title: 'UV-развёртка', icon: 'image', render: () => <UVEditor /> },
}

export function PanelHost({ side }: { side: Side }) {
  const order = useLayoutStore((s) => s.order[side])
  const collapsed = useLayoutStore((s) => s.collapsed)
  const hidden = useLayoutStore((s) => s.hidden)
  const move = useLayoutStore((s) => s.move)
  const toggleCollapse = useLayoutStore((s) => s.toggleCollapse)
  const toggleHidden = useLayoutStore((s) => s.toggleHidden)

  const visible = order.filter((id) => !hidden[id])

  return (
    <div
      className={`panel-host ${side}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('panel')) e.preventDefault()
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData('panel') as PanelId
        if (id) move(id, side, null)
      }}
    >
      {visible.map((id) => {
        const def = REGISTRY[id]
        const isCollapsed = collapsed[id]
        return (
          <section
            className={`panel${isCollapsed ? ' collapsed' : ''}`}
            key={id}
            onDrop={(e) => {
              const dragged = e.dataTransfer.getData('panel') as PanelId
              if (dragged && dragged !== id) {
                e.stopPropagation()
                move(dragged, side, id)
              }
            }}
          >
            <header
              className="panel-header"
              draggable
              onDragStart={(e) => e.dataTransfer.setData('panel', id)}
            >
              <span className="grip">
                <Icon name="grip" size={14} />
              </span>
              <Icon name={def.icon} size={14} />
              <span className="panel-title">{def.title}</span>
              <button
                className="icon-btn"
                title={isCollapsed ? 'Развернуть' : 'Свернуть'}
                onClick={() => toggleCollapse(id)}
              >
                <Icon name={isCollapsed ? 'expand' : 'collapse'} size={15} />
              </button>
              <button className="icon-btn" title="Скрыть панель" onClick={() => toggleHidden(id)}>
                <Icon name="eyeOff" size={15} />
              </button>
            </header>
            {!isCollapsed && <div className="panel-body">{def.render()}</div>}
          </section>
        )
      })}
    </div>
  )
}
