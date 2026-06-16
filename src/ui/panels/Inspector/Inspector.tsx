import { isLightNode, isMeshNode } from '../../../domain/nodes/SceneNode.ts'
import { useEditorStore } from '../../../state/useEditorStore.ts'
import { useProjectStore } from '../../../state/useProjectStore.ts'
import { ColorField } from './widgets.tsx'
import { LightPanel } from './LightPanel.tsx'
import { MaterialPanel } from './MaterialPanel.tsx'
import { MeshInfoPanel } from './MeshInfoPanel.tsx'
import { TransformPanel } from './TransformPanel.tsx'

export function Inspector() {
  const selectedId = useEditorStore((s) => s.selectedId)
  const node = useProjectStore((s) =>
    selectedId ? s.project.scene.nodes[selectedId] : undefined,
  )
  const background = useProjectStore((s) => s.project.environment.background)
  const setBackground = useProjectStore((s) => s.setBackground)

  if (!node) {
    return (
      <>
        <div className="section">
          <h3>Окружение</h3>
          <ColorField label="Фон" value={background} onChange={setBackground} />
        </div>
        <p className="hint">Выберите узел в дереве сцены или во вьюпорте.</p>
      </>
    )
  }

  return (
    <>
      <div className="section">
        <h3>{node.name}</h3>
        <div className="hint">{node.kind}</div>
      </div>
      <TransformPanel node={node} />
      {isMeshNode(node) && (
        <>
          <MaterialPanel node={node} />
          <MeshInfoPanel node={node} />
        </>
      )}
      {isLightNode(node) && <LightPanel node={node} />}
    </>
  )
}
