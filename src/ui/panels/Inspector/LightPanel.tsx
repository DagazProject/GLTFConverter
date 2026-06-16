import type { LightNode } from '../../../domain/nodes/SceneNode.ts'
import { useProjectStore } from '../../../state/useProjectStore.ts'
import { CheckField, ColorField, SliderField } from './widgets.tsx'

const RAD2DEG = 180 / Math.PI
const DEG2RAD = Math.PI / 180

const TYPE_LABEL: Record<string, string> = {
  ambient: 'Ambient',
  hemisphere: 'Sky / Hemisphere',
  directional: 'Directional',
  point: 'Point',
  spot: 'Spot',
  rect: 'Rect (Area)',
}

export function LightPanel({ node }: { node: LightNode }) {
  const updateLight = useProjectStore((s) => s.updateLight)
  const light = node.light
  const set = (patch: Partial<typeof light>) => updateLight(node.id, patch)

  const hasRadius = light.type === 'point' || light.type === 'spot' || light.type === 'rect'
  const directional =
    light.type === 'directional' || light.type === 'spot' || light.type === 'rect'

  // Spot cone: outer = angle, inner derived from penumbra.
  const outerDeg = (light.angle ?? Math.PI / 6) * RAD2DEG
  const innerDeg = outerDeg * (1 - (light.penumbra ?? 0.3))

  return (
    <div className="section">
      <h3>Свет — {TYPE_LABEL[light.type]}</h3>

      <div className="set-label">Цвет</div>
      <CheckField
        label="Температура"
        value={light.useTemperature ?? false}
        onChange={(useTemperature) => set({ useTemperature })}
      />
      {light.useTemperature ? (
        <SliderField
          label="Кельвины"
          value={light.temperature ?? 6500}
          min={1700}
          max={12000}
          step={50}
          onChange={(temperature) => set({ temperature })}
        />
      ) : (
        <ColorField label="Цвет" value={light.color} onChange={(color) => set({ color })} />
      )}

      <div className="set-label" style={{ marginTop: 8 }}>
        Интенсивность
      </div>
      <SliderField
        label={light.type === 'directional' ? 'lux' : light.type === 'rect' ? 'нит' : 'кд'}
        value={light.intensity}
        min={0}
        max={light.type === 'directional' ? 20 : light.type === 'rect' ? 30 : 100}
        step={0.1}
        onChange={(intensity) => set({ intensity })}
      />

      {hasRadius && (
        <SliderField
          label="Радиус"
          value={light.distance ?? 0}
          min={0}
          max={50}
          step={0.5}
          onChange={(distance) => set({ distance })}
        />
      )}

      {light.type === 'rect' && (
        <>
          <SliderField
            label="Ширина"
            value={light.width ?? 4}
            min={0.1}
            max={20}
            step={0.1}
            onChange={(width) => set({ width })}
          />
          <SliderField
            label="Высота"
            value={light.height ?? 4}
            min={0.1}
            max={20}
            step={0.1}
            onChange={(height) => set({ height })}
          />
        </>
      )}

      {light.type === 'spot' && (
        <>
          <SliderField
            label="Внешн.°"
            value={outerDeg}
            min={1}
            max={80}
            step={1}
            onChange={(deg) => {
              const angle = deg * DEG2RAD
              set({ angle, penumbra: Math.max(0, 1 - innerDeg / deg) })
            }}
          />
          <SliderField
            label="Внутр.°"
            value={innerDeg}
            min={0}
            max={outerDeg}
            step={1}
            onChange={(deg) => set({ penumbra: Math.max(0, Math.min(1, 1 - deg / outerDeg)) })}
          />
        </>
      )}

      {light.type === 'hemisphere' && (
        <ColorField
          label="Земля"
          value={light.groundColor ?? { r: 0.2, g: 0.2, b: 0.25 }}
          onChange={(groundColor) => set({ groundColor })}
        />
      )}

      {(light.type === 'directional' ||
        light.type === 'spot' ||
        light.type === 'point') && (
        <>
          <div className="set-label" style={{ marginTop: 8 }}>
            Тени
          </div>
          <CheckField
            label="Отбрасывать"
            value={light.castShadow ?? false}
            onChange={(castShadow) => set({ castShadow })}
          />
        </>
      )}

      {directional && (
        <p className="hint" style={{ marginTop: 8 }}>
          Направление: режим «Поворот» (E) — тяните гизмо во вьюпорте, чтобы
          нацелить источник. Источники всегда видны значком ☀.
        </p>
      )}
    </div>
  )
}
