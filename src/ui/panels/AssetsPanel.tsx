import { useState } from 'react'
import { createDefaultMaterial, TEXTURE_SLOTS } from '../../domain/assets/MaterialAsset.ts'
import { isMeshNode } from '../../domain/nodes/SceneNode.ts'
import { newAssetId } from '../../domain/scene/ids.ts'
import type { AssetId } from '../../domain/scene/ids.ts'
import { readFileAsDataUrl } from '../../infrastructure/files/fileRead.ts'
import { useEditorStore } from '../../state/useEditorStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'
import { Icon } from '../icons/Icon.tsx'
import { MaterialCard } from './Inspector/MaterialCard.tsx'
import { rgbToHexString } from './Inspector/widgets.tsx'

/**
 * Library of all materials and textures in the scene. Lets you edit them in one
 * place and share a single material across multiple meshes.
 */
export function AssetsPanel() {
  const materials = useProjectStore((s) => s.project.assets.materials)
  const textures = useProjectStore((s) => s.project.assets.textures)
  const nodes = useProjectStore((s) => s.project.scene.nodes)
  const addMaterial = useProjectStore((s) => s.addMaterial)
  const removeMaterial = useProjectStore((s) => s.removeMaterial)
  const assignMaterialSlot = useProjectStore((s) => s.assignMaterialSlot)
  const addTexture = useProjectStore((s) => s.addTexture)
  const removeTexture = useProjectStore((s) => s.removeTexture)

  const selectedId = useEditorStore((s) => s.selectedId)
  const selectedNode = selectedId ? nodes[selectedId] : undefined
  const selectedMesh = selectedNode && isMeshNode(selectedNode) ? selectedNode : null

  const [openMaterial, setOpenMaterial] = useState<AssetId | null>(null)

  const materialUsage = (id: AssetId) =>
    Object.values(nodes).filter((n) => isMeshNode(n) && n.materialIds.includes(id)).length
  const textureUsage = (id: AssetId) =>
    Object.values(materials).filter((m) => TEXTURE_SLOTS.some((s) => m[s] === id)).length

  const onAddMaterial = () => {
    const mat = createDefaultMaterial(`Material ${Object.keys(materials).length + 1}`)
    addMaterial(mat)
    setOpenMaterial(mat.id)
  }

  const onUploadTexture = async (file: File) => {
    const url = await readFileAsDataUrl(file)
    addTexture({
      id: newAssetId(),
      name: file.name,
      url,
      wrapS: 'repeat',
      wrapT: 'repeat',
      flipY: true,
      colorSpace: 'srgb',
      repeat: { x: 1, y: 1 },
      offset: { x: 0, y: 0 },
    })
  }

  return (
    <div className="assets">
      <div className="section">
        <div className="section-head">
          <h3>Материалы ({Object.keys(materials).length})</h3>
          <button className="icon-btn" title="Новый материал" onClick={onAddMaterial}>
            <Icon name="plus" size={16} />
          </button>
        </div>

        {Object.values(materials).length === 0 && (
          <p className="hint">Нет материалов. Создайте новый или импортируйте модель.</p>
        )}

        {Object.values(materials).map((m) => {
          const used = materialUsage(m.id)
          const open = openMaterial === m.id
          return (
            <div className="asset-row-wrap" key={m.id}>
              <div className="asset-row">
                <span
                  className="swatch"
                  style={{ background: rgbToHexString(m.color) }}
                  onClick={() => setOpenMaterial(open ? null : m.id)}
                />
                <span className="asset-name" onClick={() => setOpenMaterial(open ? null : m.id)}>
                  {m.name}
                </span>
                <span className="asset-meta">{used}×</span>
                {selectedMesh && (
                  <button
                    className="mini"
                    title="Назначить выделенному мешу"
                    onClick={() => assignMaterialSlot(selectedMesh.id, 0, m.id)}
                  >
                    → меш
                  </button>
                )}
                <button
                  className="icon-btn"
                  title={used ? 'Используется, нельзя удалить' : 'Удалить'}
                  disabled={used > 0}
                  onClick={() => removeMaterial(m.id)}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
              {open && <MaterialCard material={m} />}
            </div>
          )
        })}
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Текстуры ({Object.keys(textures).length})</h3>
          <label className="icon-btn" title="Загрузить текстуру">
            <Icon name="plus" size={16} />
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onUploadTexture(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>

        <div className="texture-grid">
          {Object.values(textures).map((t) => {
            const used = textureUsage(t.id)
            return (
              <div className="texture-tile" key={t.id} title={`${t.name} · ${used}×`}>
                <img src={t.url} alt={t.name} />
                <span className="texture-name">{t.name}</span>
                <button
                  className="texture-del icon-btn"
                  disabled={used > 0}
                  title={used ? 'Используется' : 'Удалить'}
                  onClick={() => removeTexture(t.id)}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            )
          })}
          {Object.keys(textures).length === 0 && (
            <p className="hint">Нет текстур. Загрузите изображение.</p>
          )}
        </div>
      </div>
    </div>
  )
}
