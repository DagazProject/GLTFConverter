import type { RGB } from './types.ts'

/**
 * Approximate a colour-temperature (Kelvin) as linear-ish sRGB, à la Unreal's
 * light "Temperature". Based on Tanner Helland's algorithm, clamped to 1000–40000K.
 */
export const kelvinToRgb = (kelvin: number): RGB => {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100
  let r: number
  let g: number
  let b: number

  if (t <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(t) - 161.1195681661
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492)
  }

  if (t >= 66) {
    b = 255
  } else if (t <= 19) {
    b = 0
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307
  }

  const clamp = (v: number) => Math.min(255, Math.max(0, v)) / 255
  return { r: clamp(r), g: clamp(g), b: clamp(b) }
}
