import { useEffect, useState } from 'react'
import type { ViewDir, ViewportSettings } from '../../engine/Engine.ts'
import { useEngineStore } from '../../state/useEngineStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'
import { Icon } from '../icons/Icon.tsx'
import { hexStringToRgb, rgbToHexString } from '../panels/Inspector/widgets.tsx'

const QUICK_VIEWS: { dir: ViewDir; label: string }[] = [
  { dir: 'front', label: 'Спер.' },
  { dir: 'back', label: 'Сзади' },
  { dir: 'left', label: 'Слева' },
  { dir: 'right', label: 'Справа' },
  { dir: 'top', label: 'Сверху' },
  { dir: 'bottom', label: 'Снизу' },
]

export function ViewportOverlay() {
  const engine = useEngineStore((s) => s.engine)
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<ViewportSettings>({
    grid: true,
    axes: true,
    wireframe: false,
    fov: 50,
  })
  const background = useProjectStore((s) => s.project.environment.background)
  const setBackground = useProjectStore((s) => s.setBackground)

  useEffect(() => {
    if (engine) setSettings(engine.getSettings())
  }, [engine])

  const view = (dir: ViewDir) => engine?.setView(dir)

  const patch = (p: Partial<ViewportSettings>) => {
    const next = { ...settings, ...p }
    setSettings(next)
    if (!engine) return
    if (p.grid !== undefined) engine.setGridVisible(p.grid)
    if (p.axes !== undefined) engine.setAxesVisible(p.axes)
    if (p.wireframe !== undefined) engine.setWireframe(p.wireframe)
    if (p.fov !== undefined) engine.setFov(p.fov)
  }

  return (
    <div className="viewport-overlay">
      <div className="view-cube">
        <svg viewBox="0 0 80 84" width="80" height="84">
          <polygon
            className="cube-face"
            points="40,6 70,23 40,40 10,23"
            onClick={() => view('top')}
          />
          <polygon
            className="cube-face left"
            points="10,23 40,40 40,74 10,57"
            onClick={() => view('front')}
          />
          <polygon
            className="cube-face right"
            points="70,23 40,40 40,74 70,57"
            onClick={() => view('right')}
          />
          <text x="40" y="26" className="cube-label">
            TOP
          </text>
        </svg>
        <div className="view-buttons">
          {QUICK_VIEWS.map((v) => (
            <button key={v.dir} className="mini" onClick={() => view(v.dir)}>
              {v.label}
            </button>
          ))}
          <button className="mini" onClick={() => view('iso')}>
            Изо
          </button>
        </div>
      </div>

      <div className="viewport-settings">
        <button className="icon-btn settings-btn" title="Настройки вьюпорта" onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'collapse' : 'expand'} size={16} />
          ⚙
        </button>
        {open && (
          <div className="settings-pop">
            <label className="set-row">
              <input
                type="checkbox"
                checked={settings.grid}
                onChange={(e) => patch({ grid: e.target.checked })}
              />
              Сетка
            </label>
            <label className="set-row">
              <input
                type="checkbox"
                checked={settings.axes}
                onChange={(e) => patch({ axes: e.target.checked })}
              />
              Оси
            </label>
            <label className="set-row">
              <input
                type="checkbox"
                checked={settings.wireframe}
                onChange={(e) => patch({ wireframe: e.target.checked })}
              />
              Каркас
            </label>
            <div className="set-row">
              <span>FOV</span>
              <input
                type="range"
                min={20}
                max={100}
                step={1}
                value={settings.fov}
                onChange={(e) => patch({ fov: parseFloat(e.target.value) })}
              />
              <span style={{ width: 26 }}>{Math.round(settings.fov)}</span>
            </div>
            <div className="set-row">
              <span style={{ flex: 1 }}>Фон</span>
              <input
                type="color"
                style={{ width: 40 }}
                value={rgbToHexString(background)}
                onChange={(e) => setBackground(hexStringToRgb(e.target.value))}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
