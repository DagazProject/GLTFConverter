import type { AssetId, NodeId } from '../scene/ids.ts'
import type { Transform } from '../scene/Transform.ts'
import type { LightData } from './lights.ts'

export type NodeKind = 'group' | 'mesh' | 'light' | 'camera'

interface BaseNode {
  id: NodeId
  name: string
  kind: NodeKind
  parentId: NodeId | null
  childrenIds: NodeId[]
  transform: Transform
  visible: boolean
}

export interface GroupNode extends BaseNode {
  kind: 'group'
}

export interface MeshNode extends BaseNode {
  kind: 'mesh'
  geometryId: AssetId
  /** Material slots. Index N is applied to geometry group with materialIndex N. */
  materialIds: AssetId[]
}

export interface LightNode extends BaseNode {
  kind: 'light'
  light: LightData
}

export interface CameraNode extends BaseNode {
  kind: 'camera'
  camera: {
    fov: number
    near: number
    far: number
  }
}

export type SceneNode = GroupNode | MeshNode | LightNode | CameraNode

export const isMeshNode = (n: SceneNode): n is MeshNode => n.kind === 'mesh'
export const isLightNode = (n: SceneNode): n is LightNode => n.kind === 'light'
export const isGroupNode = (n: SceneNode): n is GroupNode => n.kind === 'group'
export const isCameraNode = (n: SceneNode): n is CameraNode =>
  n.kind === 'camera'
