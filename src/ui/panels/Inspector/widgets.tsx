import type { RGB } from '../../../domain/math/types.ts'
import { rgb } from '../../../domain/math/types.ts'

export function NumberField(props: {
  label: string
  value: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="field">
      <label>{props.label}</label>
      <input
        type="number"
        value={Number.isFinite(props.value) ? round(props.value) : 0}
        step={props.step ?? 0.1}
        onChange={(e) => props.onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  )
}

export function Vec3Field(props: {
  label: string
  value: { x: number; y: number; z: number }
  step?: number
  /** Optional per-axis lower bound (e.g. scale must stay positive). */
  min?: number
  onChange: (v: { x: number; y: number; z: number }) => void
}) {
  const { value, onChange, step = 0.1, min } = props
  return (
    <div className="field">
      <label>{props.label}</label>
      <div className="vec3">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <input
            key={axis}
            type="number"
            step={step}
            min={min}
            value={round(value[axis])}
            onChange={(e) => {
              const v = parseFloat(e.target.value) || 0
              onChange({ ...value, [axis]: min != null ? Math.max(min, v) : v })
            }}
          />
        ))}
      </div>
    </div>
  )
}

export function SliderField(props: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="field">
      <label>{props.label}</label>
      <div className="swatch-row">
        <input
          type="range"
          min={props.min ?? 0}
          max={props.max ?? 1}
          step={props.step ?? 0.01}
          value={props.value}
          onChange={(e) => props.onChange(parseFloat(e.target.value))}
        />
        <span style={{ width: 36, textAlign: 'right' }}>{round(props.value)}</span>
      </div>
    </div>
  )
}

export function ColorField(props: {
  label: string
  value: RGB
  onChange: (v: RGB) => void
}) {
  return (
    <div className="field">
      <label>{props.label}</label>
      <input
        type="color"
        value={rgbToHexString(props.value)}
        onChange={(e) => props.onChange(hexStringToRgb(e.target.value))}
      />
    </div>
  )
}

export function CheckField(props: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="field">
      <label>{props.label}</label>
      <input
        type="checkbox"
        checked={props.value}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </div>
  )
}

const round = (v: number) => Math.round(v * 1000) / 1000

const channel = (c: number) =>
  Math.max(0, Math.min(255, Math.round(c * 255)))
    .toString(16)
    .padStart(2, '0')

export const rgbToHexString = (c: RGB): string =>
  `#${channel(c.r)}${channel(c.g)}${channel(c.b)}`

export const hexStringToRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace('#', ''), 16)
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255)
}
