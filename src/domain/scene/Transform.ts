import type { Quat, Vec3 } from '../math/types.ts'
import { quatIdentity, vec3 } from '../math/types.ts'

export interface Transform {
  position: Vec3
  /** Local rotation as a quaternion. */
  rotation: Quat
  scale: Vec3
}

/** Smallest allowed per-axis scale; keeps objects from inverting through zero. */
export const MIN_SCALE = 1e-3

export const identityTransform = (): Transform => ({
  position: vec3(0, 0, 0),
  rotation: quatIdentity(),
  scale: vec3(1, 1, 1),
})
