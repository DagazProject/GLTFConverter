import type { AssetId } from '../scene/ids.ts'
import type { GeometryAsset } from './GeometryAsset.ts'
import type { MaterialAsset } from './MaterialAsset.ts'
import type { TextureAsset } from './TextureAsset.ts'

export interface AssetRegistry {
  geometries: Record<AssetId, GeometryAsset>
  materials: Record<AssetId, MaterialAsset>
  textures: Record<AssetId, TextureAsset>
}

export const emptyAssetRegistry = (): AssetRegistry => ({
  geometries: {},
  materials: {},
  textures: {},
})
