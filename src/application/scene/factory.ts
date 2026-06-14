import * as THREE from 'three'
import { geometryToAsset } from '../../engine/asset/extract.ts'
import { createDefaultMaterial } from '../../domain/assets/MaterialAsset.ts'
import { createLightNode, createMeshNode } from '../../domain/nodes/builders.ts'
import type { LightData, LightType } from '../../domain/nodes/lights.ts'
import type { SceneFragment } from '../../domain/project/SceneFragment.ts'
import { emptyFragment } from '../../domain/project/SceneFragment.ts'
import { rgb } from '../../domain/math/types.ts'

export type PrimitiveKind = 'box' | 'sphere' | 'cylinder' | 'plane' | 'torus'

const buildPrimitiveGeometry = (kind: PrimitiveKind): THREE.BufferGeometry => {
  switch (kind) {
    case 'sphere':
      return new THREE.SphereGeometry(0.75, 48, 32)
    case 'cylinder':
      return new THREE.CylinderGeometry(0.6, 0.6, 1.4, 48)
    case 'plane':
      return new THREE.PlaneGeometry(2, 2, 1, 1)
    case 'torus':
      return new THREE.TorusGeometry(0.7, 0.28, 24, 64)
    case 'box':
    default:
      return new THREE.BoxGeometry(1, 1, 1)
  }
}

const PRIMITIVE_LABEL: Record<PrimitiveKind, string> = {
  box: 'Box',
  sphere: 'Sphere',
  cylinder: 'Cylinder',
  plane: 'Plane',
  torus: 'Torus',
}

export const createPrimitiveFragment = (kind: PrimitiveKind): SceneFragment => {
  const fragment = emptyFragment()
  const geo = buildPrimitiveGeometry(kind)
  const geoAsset = geometryToAsset(geo, PRIMITIVE_LABEL[kind])
  geo.dispose()
  const material = createDefaultMaterial(`${PRIMITIVE_LABEL[kind]} Material`)
  const mesh = createMeshNode(geoAsset.id, [material.id], PRIMITIVE_LABEL[kind])

  fragment.geometries[geoAsset.id] = geoAsset
  fragment.materials[material.id] = material
  fragment.nodes[mesh.id] = mesh
  fragment.rootIds.push(mesh.id)
  return fragment
}

const defaultLight = (type: LightType): LightData => {
  const base: LightData = {
    type,
    color: rgb(1, 1, 1),
    intensity: 1,
    useTemperature: false,
    temperature: 6500,
  }
  if (type === 'point' || type === 'spot') {
    base.intensity = 40
    base.distance = 0
    base.decay = 2
    base.castShadow = true
  }
  if (type === 'spot') {
    base.angle = Math.PI / 6
    base.penumbra = 0.3
  }
  if (type === 'rect') {
    base.intensity = 6
    base.width = 4
    base.height = 4
  }
  if (type === 'directional') {
    base.intensity = 3
    base.castShadow = true
  }
  if (type === 'hemisphere') base.groundColor = rgb(0.2, 0.2, 0.25)
  return base
}

const LIGHT_LABEL: Record<LightType, string> = {
  ambient: 'Ambient Light',
  hemisphere: 'Hemisphere Light',
  directional: 'Directional Light',
  point: 'Point Light',
  spot: 'Spot Light',
  rect: 'Rect Light',
}

export const createLightFragment = (type: LightType): SceneFragment => {
  const fragment = emptyFragment()
  const node = createLightNode(defaultLight(type), LIGHT_LABEL[type])
  if (type !== 'ambient' && type !== 'hemisphere') {
    node.transform.position = { x: 3, y: 5, z: 4 }
  }
  fragment.nodes[node.id] = node
  fragment.rootIds.push(node.id)
  return fragment
}
