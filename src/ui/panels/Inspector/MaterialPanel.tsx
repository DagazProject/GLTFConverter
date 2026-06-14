import { createDefaultMaterial } from '../../../domain/assets/MaterialAsset.ts'
import type { MeshNode } from '../../../domain/nodes/SceneNode.ts'
import type { AssetId } from '../../../domain/scene/ids.ts'
import { useProjectStore } from '../../../state/useProjectStore.ts'
import { MaterialCard } from './MaterialCard.tsx'

export function MaterialPanel({ node }: { node: MeshNode }) {
  const materials = useProjectStore((s) => s.project.assets.materials)
  const addMaterialSlot = useProjectStore((s) => s.addMaterialSlot)
  const addMaterial = useProjectStore((s) => s.addMaterial)
  const assignMaterialSlot = useProjectStore((s) => s.assignMaterialSlot)

  const addSlot = () => {
    const mat = createDefaultMaterial(`Material ${node.materialIds.length + 1}`)
    addMaterial(mat)
    addMaterialSlot(node.id, mat.id)
  }

  return (
    <div className="section">
      <h3>Материалы ({node.materialIds.length})</h3>
      {node.materialIds.map((id, slot) => {
        const material = materials[id]
        if (!material) return null
        return (
          <div key={`${id}-${slot}`}>
            <div className="field">
              <label>Слот {slot}</label>
              <select
                value={id}
                title="Назначить существующий материал"
                onChange={(e) =>
                  assignMaterialSlot(node.id, slot, e.target.value as AssetId)
                }
              >
                {Object.values(materials).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <MaterialCard material={material} />
          </div>
        )
      })}
      <button onClick={addSlot}>+ слот материала</button>
    </div>
  )
}
