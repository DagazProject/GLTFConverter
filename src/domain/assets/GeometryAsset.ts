import type { AssetId } from '../scene/ids.ts'

/** A single vertex attribute, JSON-serializable. */
export interface BufferData {
  array: number[]
  itemSize: number
  normalized?: boolean
}

export interface GeometryGroup {
  start: number
  count: number
  materialIndex: number
}

/**
 * Serializable geometry. Mirrors the subset of THREE.BufferGeometry we support;
 * converted to/from three in the engine's AssetFactory.
 */
export interface GeometryAsset {
  id: AssetId
  name: string
  attributes: {
    position: BufferData
    normal?: BufferData
    uv?: BufferData
    uv2?: BufferData
    color?: BufferData
    tangent?: BufferData
  }
  index?: number[]
  /** Material groups for multi-material meshes. */
  groups?: GeometryGroup[]
}
