import type { GeometryAsset } from '../assets/GeometryAsset.ts'
import type { MaterialAsset } from '../assets/MaterialAsset.ts'
import type { TextureAsset } from '../assets/TextureAsset.ts'
import type { SceneNode } from '../nodes/SceneNode.ts'
import type { AssetId, NodeId } from '../scene/ids.ts'

/**
 * A self-contained chunk of scene + assets, produced by importers and merged
 * into a Project. rootIds are the fragment's top-level nodes (attached under
 * the scene root on merge).
 */
export interface SceneFragment {
  nodes: Record<NodeId, SceneNode>
  rootIds: NodeId[]
  geometries: Record<AssetId, GeometryAsset>
  materials: Record<AssetId, MaterialAsset>
  textures: Record<AssetId, TextureAsset>
}

export const emptyFragment = (): SceneFragment => ({
  nodes: {},
  rootIds: [],
  geometries: {},
  materials: {},
  textures: {},
})
