import type { RGB } from '../math/types.ts'

export type LightType =
  | 'ambient'
  | 'hemisphere'
  | 'directional'
  | 'point'
  | 'spot'
  | 'rect'

/** Unreal-flavoured light parameters. */
export interface LightData {
  type: LightType
  color: RGB
  intensity: number

  /** Use a colour temperature (Kelvin) as the light colour, like Unreal. */
  useTemperature?: boolean
  temperature?: number

  /** Attenuation radius (point/spot/rect). 0 = unbounded. */
  distance?: number
  decay?: number

  /** Spot cone angles, in radians. */
  angle?: number
  penumbra?: number

  /** Rect (area) light source size. */
  width?: number
  height?: number

  /** Hemisphere ground colour. */
  groundColor?: RGB

  castShadow?: boolean
}
