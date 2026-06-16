import type { AssetId } from '../scene/ids.ts'

export type Wrap = 'repeat' | 'clamp' | 'mirror'
export type ColorSpace = 'srgb' | 'linear'

/**
 * Image data is held as a data: URL so the whole project round-trips through
 * JSON and IndexedDB (structured clone) without side files.
 */
export interface TextureAsset {
  id: AssetId
  name: string
  url: string
  wrapS: Wrap
  wrapT: Wrap
  flipY: boolean
  colorSpace: ColorSpace
  repeat: { x: number; y: number }
  offset: { x: number; y: number }
}
