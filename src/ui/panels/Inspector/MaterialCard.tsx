import { useState } from 'react'
import type { MaterialAsset, TextureSlot } from '../../../domain/assets/MaterialAsset.ts'
import { TEXTURE_SLOTS } from '../../../domain/assets/MaterialAsset.ts'
import { MaterialPresetPicker } from './MaterialPresetPicker.tsx'
import { newAssetId } from '../../../domain/scene/ids.ts'
import type { AssetId } from '../../../domain/scene/ids.ts'
import { readFileAsDataUrl } from '../../../infrastructure/files/fileRead.ts'
import { useProjectStore } from '../../../state/useProjectStore.ts'
import { CheckField, ColorField, NumberField, SliderField } from './widgets.tsx'

const COLOR_SLOTS = new Set<TextureSlot>(['map', 'emissiveMap'])

/** Full editor for a single MaterialAsset, reused by the inspector and assets panel. */
export function MaterialCard({ material }: { material: MaterialAsset }) {
  const [showPresets, setShowPresets] = useState(false)
  const update = useProjectStore((s) => s.updateMaterial)
  const addTexture = useProjectStore((s) => s.addTexture)
  const setMaterialTexture = useProjectStore((s) => s.setMaterialTexture)
  const textures = useProjectStore((s) => s.project.assets.textures)

  const onUpload = async (slot: TextureSlot, file: File) => {
    const url = await readFileAsDataUrl(file)
    const id = newAssetId()
    addTexture({
      id,
      name: file.name,
      url,
      wrapS: 'repeat',
      wrapT: 'repeat',
      flipY: true,
      colorSpace: COLOR_SLOTS.has(slot) ? 'srgb' : 'linear',
      repeat: { x: 1, y: 1 },
      offset: { x: 0, y: 0 },
    })
    setMaterialTexture(material.id, slot, id)
  }

  return (
    <div className="material-card">
      <div className="field">
        <label>Пресет</label>
        <button onClick={() => setShowPresets(true)}>Выбрать пресет…</button>
      </div>
      {showPresets && (
        <MaterialPresetPicker
          onApply={(preset) => update(material.id, preset.props)}
          onClose={() => setShowPresets(false)}
        />
      )}
      <div className="field">
        <label>Имя</label>
        <input
          value={material.name}
          onChange={(e) => update(material.id, { name: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Тип</label>
        <select
          value={material.type}
          onChange={(e) =>
            update(material.id, { type: e.target.value as MaterialAsset['type'] })
          }
        >
          <option value="standard">standard</option>
          <option value="physical">physical</option>
          <option value="basic">basic</option>
        </select>
      </div>
      <ColorField
        label="Цвет"
        value={material.color}
        onChange={(color) => update(material.id, { color })}
      />
      <SliderField
        label="Roughness"
        value={material.roughness}
        onChange={(roughness) => update(material.id, { roughness })}
      />
      <SliderField
        label="Metalness"
        value={material.metalness}
        onChange={(metalness) => update(material.id, { metalness })}
      />
      <ColorField
        label="Emissive"
        value={material.emissive}
        onChange={(emissive) => update(material.id, { emissive })}
      />
      <NumberField
        label="Emissive ×"
        value={material.emissiveIntensity}
        onChange={(emissiveIntensity) => update(material.id, { emissiveIntensity })}
      />
      <SliderField
        label="Opacity"
        value={material.opacity}
        onChange={(opacity) => update(material.id, { opacity, transparent: opacity < 1 })}
      />
      <div className="field">
        <label>Сторона</label>
        <select
          value={material.side}
          onChange={(e) =>
            update(material.id, { side: e.target.value as MaterialAsset['side'] })
          }
        >
          <option value="front">front</option>
          <option value="back">back</option>
          <option value="double">double</option>
        </select>
      </div>
      <CheckField
        label="Wireframe"
        value={material.wireframe}
        onChange={(wireframe) => update(material.id, { wireframe })}
      />
      <CheckField
        label="Flat shading"
        value={material.flatShading}
        onChange={(flatShading) => update(material.id, { flatShading })}
      />

      <h3 style={{ marginTop: 10 }}>Текстуры</h3>
      {TEXTURE_SLOTS.map((slot) => {
        const texId = material[slot]
        return (
          <div className="field" key={slot}>
            <label>{slot}</label>
            <div className="swatch-row">
              <select
                value={texId ?? ''}
                onChange={(e) =>
                  setMaterialTexture(
                    material.id,
                    slot,
                    e.target.value ? (e.target.value as AssetId) : undefined,
                  )
                }
              >
                <option value="">— нет —</option>
                {Object.values(textures).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="Загрузить новую"
                onClick={(e) =>
                  (e.currentTarget.nextElementSibling as HTMLInputElement)?.click()
                }
              >
                +
              </button>
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void onUpload(slot, f)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
