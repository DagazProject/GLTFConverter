import type { RGB } from '../math/types.ts'
import { rgb } from '../math/types.ts'
import type { AssetId } from '../scene/ids.ts'
import { newAssetId } from '../scene/ids.ts'

export type MaterialType = 'standard' | 'physical' | 'basic'
export type MaterialSide = 'front' | 'back' | 'double'

/** PBR-oriented material. Texture slots reference TextureAsset ids. */
export interface MaterialAsset {
  id: AssetId
  name: string
  type: MaterialType
  color: RGB
  roughness: number
  metalness: number
  emissive: RGB
  emissiveIntensity: number
  opacity: number
  transparent: boolean
  side: MaterialSide
  wireframe: boolean
  flatShading: boolean
  /** Use per-vertex colours (enabled by the paint brush). */
  vertexColors?: boolean
  // texture slots
  map?: AssetId
  normalMap?: AssetId
  roughnessMap?: AssetId
  metalnessMap?: AssetId
  emissiveMap?: AssetId
  aoMap?: AssetId
}

export const createDefaultMaterial = (name = 'Material'): MaterialAsset => ({
  id: newAssetId(),
  name,
  type: 'standard',
  color: rgb(0.85, 0.85, 0.85),
  roughness: 0.8,
  metalness: 0.05,
  emissive: rgb(0, 0, 0),
  emissiveIntensity: 1,
  opacity: 1,
  transparent: false,
  side: 'front',
  wireframe: false,
  flatShading: false,
})

/** texture-slot keys, used by editor + export to detect texture usage. */
export const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
] as const

export type TextureSlot = (typeof TEXTURE_SLOTS)[number]
