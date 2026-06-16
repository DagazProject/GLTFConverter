import { identityTransform } from '../scene/Transform.ts'
import { newNodeId } from '../scene/ids.ts'
import type { AssetId } from '../scene/ids.ts'
import type {
  GroupNode,
  LightNode,
  MeshNode,
} from './SceneNode.ts'
import type { LightData } from './lights.ts'

export const createGroupNode = (name = 'Group'): GroupNode => ({
  id: newNodeId(),
  name,
  kind: 'group',
  parentId: null,
  childrenIds: [],
  transform: identityTransform(),
  visible: true,
})

export const createMeshNode = (
  geometryId: AssetId,
  materialIds: AssetId[],
  name = 'Mesh',
): MeshNode => ({
  id: newNodeId(),
  name,
  kind: 'mesh',
  parentId: null,
  childrenIds: [],
  transform: identityTransform(),
  visible: true,
  geometryId,
  materialIds,
})

export const createLightNode = (light: LightData, name = 'Light'): LightNode => ({
  id: newNodeId(),
  name,
  kind: 'light',
  parentId: null,
  childrenIds: [],
  transform: identityTransform(),
  visible: true,
  light,
})
