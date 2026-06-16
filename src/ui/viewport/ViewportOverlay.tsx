import { useEffect, useState } from 'react'
import type { ViewportSettings } from '../../engine/Engine.ts'
import { useEngineStore } from '../../state/useEngineStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'
import { Icon } from '../icons/Icon.tsx'
import { hexStringToRgb, rgbToHexString } from '../panels/Inspector/widgets.tsx'

const DEFAULTS: ViewportSettings = {
  grid: true,
  axes: true,
  wireframe: false,
  fov: 50,
  snap: false,
  snapSize: 0.5,
}

/**
 * Viewport HUD. The rotating navigation gizmo is drawn by the engine
 * (three ViewHelper) in the bottom-right corner; this panel holds the
 * Unreal-style view settings.
 */
export function ViewportOverlay() {
  const engine = useEngineStore((s) => s.engine)
  const [open, setOpen] = useState(false)
  const [s, setS] = useState<ViewportSettings>(DEFAULTS)
  const background = useProjectStore((st) => st.project.environment.background)
  const setBackground = useProjectStore((st) => st.setBackground)

  useEffect(() => {
    if (engine) setS(engine.getSettings())
  }, [engine])

  const patch = (p: Partial<ViewportSettings>) => {
    const next = { ...s, ...p }
    setS(next)
    if (!engine) return
    if (p.grid !== undefined) engine.setGridVisible(p.grid)
    if (p.axes !== undefined) engine.setAxesVisible(p.axes)
    if (p.wireframe !== undefined) engine.setWireframe(p.wireframe)
    if (p.fov !== undefined) engine.setFov(p.fov)
    if (p.snap !== undefined || p.snapSize !== undefined) {
      engine.setSnap(next.snap, next.snapSize)
    }
  }

  return (
    <div className="viewport-overlay">
      <div className="viewport-settings">
        <button
          className={`settings-btn${open ? ' active' : ''}`}
          title="Настройки вьюпорта"
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="object" size={15} />
          Вид
        </button>
        {open && (
          <div className="settings-pop">
            <div className="set-group">
              <div className="set-label">Режим отображения</div>
              <div className="segmented">
                <button
                  className={!s.wireframe ? 'active' : ''}
                  onClick={() => patch({ wireframe: false })}
                >
                  Shaded
                </button>
                <button
                  className={s.wireframe ? 'active' : ''}
                  onClick={() => patch({ wireframe: true })}
                >
                  Wireframe
                </button>
              </div>
            </div>

            <div className="set-group">
              <div className="set-label">Показать</div>
              <label className="set-row">
                <input
                  type="checkbox"
                  checked={s.grid}
                  onChange={(e) => patch({ grid: e.target.checked })}
                />
                Сетка
              </label>
              <label className="set-row">
                <input
                  type="checkbox"
                  checked={s.axes}
                  onChange={(e) => patch({ axes: e.target.checked })}
                />
                Оси
              </label>
            </div>

            <div className="set-group">
              <div className="set-label">Камера</div>
              <div className="set-row">
                <span style={{ width: 34 }}>FOV</span>
                <input
                  type="range"
                  min={20}
                  max={110}
                  step={1}
                  value={s.fov}
                  onChange={(e) => patch({ fov: parseFloat(e.target.value) })}
                />
                <span style={{ width: 28, textAlign: 'right' }}>{Math.round(s.fov)}</span>
              </div>
            </div>

            <div className="set-group">
              <div className="set-label">Привязка</div>
              <label className="set-row">
                <input
                  type="checkbox"
                  checked={s.snap}
                  onChange={(e) => patch({ snap: e.target.checked })}
                />
                Шаг сетки
              </label>
              <div className="set-row">
                <span style={{ width: 34 }}>Шаг</span>
                <input
                  type="number"
                  step={0.1}
                  min={0.05}
                  value={s.snapSize}
                  disabled={!s.snap}
                  onChange={(e) => patch({ snapSize: parseFloat(e.target.value) || 0.5 })}
                />
              </div>
            </div>

            <div className="set-group">
              <div className="set-label">Фон</div>
              <div className="set-row">
                <input
                  type="color"
                  style={{ width: 44 }}
                  value={rgbToHexString(background)}
                  onChange={(e) => setBackground(hexStringToRgb(e.target.value))}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
