import type { MeshNode } from '../../../domain/nodes/SceneNode.ts'
import { useEditorStore } from '../../../state/useEditorStore.ts'
import { useProjectStore } from '../../../state/useProjectStore.ts'

export function MeshInfoPanel({ node }: { node: MeshNode }) {
  const geometry = useProjectStore((s) => s.project.assets.geometries[node.geometryId])
  const subObjectMode = useEditorStore((s) => s.subObjectMode)

  const vertexCount = geometry
    ? geometry.attributes.position.array.length / geometry.attributes.position.itemSize
    : 0
  const triCount = geometry?.index
    ? geometry.index.length / 3
    : Math.floor(vertexCount / 3)

  return (
    <div className="section">
      <h3>Геометрия</h3>
      <div className="field">
        <label>Вершины</label>
        <span>{vertexCount.toLocaleString('ru')}</span>
      </div>
      <div className="field">
        <label>Треуг.</label>
        <span>{triCount.toLocaleString('ru')}</span>
      </div>
      {subObjectMode === 'vertex' && (
        <p className="hint">
          Режим вершин: тяните точки во вьюпорте, чтобы редактировать форму.
        </p>
      )}
      {(subObjectMode === 'edge' || subObjectMode === 'polygon') && (
        <p className="hint">Режим «{subObjectMode}» — выделение готово, операции скоро.</p>
      )}
    </div>
  )
}
