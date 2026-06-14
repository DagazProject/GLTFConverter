import type { LightNode } from '../../../domain/nodes/SceneNode.ts'
import { useProjectStore } from '../../../state/useProjectStore.ts'
import { CheckField, ColorField, SliderField } from './widgets.tsx'

export function LightPanel({ node }: { node: LightNode }) {
  const updateLight = useProjectStore((s) => s.updateLight)
  const light = node.light

  return (
    <div className="section">
      <h3>Свет — {light.type}</h3>
      <ColorField
        label="Цвет"
        value={light.color}
        onChange={(color) => updateLight(node.id, { color })}
      />
      <SliderField
        label="Интенсивн."
        value={light.intensity}
        min={0}
        max={light.type === 'point' || light.type === 'spot' ? 50 : 10}
        step={0.1}
        onChange={(intensity) => updateLight(node.id, { intensity })}
      />
      {(light.type === 'point' || light.type === 'spot') && (
        <>
          <SliderField
            label="Дистанция"
            value={light.distance ?? 0}
            min={0}
            max={50}
            step={0.5}
            onChange={(distance) => updateLight(node.id, { distance })}
          />
          <SliderField
            label="Затухание"
            value={light.decay ?? 2}
            min={0}
            max={4}
            step={0.1}
            onChange={(decay) => updateLight(node.id, { decay })}
          />
        </>
      )}
      {light.type === 'spot' && (
        <>
          <SliderField
            label="Угол"
            value={light.angle ?? Math.PI / 6}
            min={0}
            max={Math.PI / 2}
            onChange={(angle) => updateLight(node.id, { angle })}
          />
          <SliderField
            label="Penumbra"
            value={light.penumbra ?? 0}
            onChange={(penumbra) => updateLight(node.id, { penumbra })}
          />
        </>
      )}
      {light.type === 'hemisphere' && (
        <ColorField
          label="Земля"
          value={light.groundColor ?? { r: 0.2, g: 0.2, b: 0.2 }}
          onChange={(groundColor) => updateLight(node.id, { groundColor })}
        />
      )}
      {(light.type === 'directional' || light.type === 'spot') && (
        <CheckField
          label="Тени"
          value={light.castShadow ?? false}
          onChange={(castShadow) => updateLight(node.id, { castShadow })}
        />
      )}
    </div>
  )
}
