import { useEffect, useMemo } from 'react'
import { MATERIAL_PRESETS } from '../../../domain/assets/materialPresets.ts'
import type { MaterialPreset } from '../../../domain/assets/materialPresets.ts'
import { materialPreview } from '../../../engine/preview/MaterialPreview.ts'

/** Modal grid of preset material balls; click one to apply it. */
export function MaterialPresetPicker(props: {
  onApply: (preset: MaterialPreset) => void
  onClose: () => void
}) {
  const previews = useMemo(
    () => MATERIAL_PRESETS.map((p) => ({ preset: p, url: materialPreview.render(p.id, p.props) })),
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal preset-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Пресеты материалов</h2>
        <div className="preset-grid">
          {previews.map(({ preset, url }) => (
            <button
              key={preset.id}
              className="preset-card"
              onClick={() => {
                props.onApply(preset)
                props.onClose()
              }}
            >
              <img src={url} alt={preset.name} />
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={props.onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}
