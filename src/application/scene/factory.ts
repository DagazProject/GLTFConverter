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
      // Subdivided so it can be edited/sculpted before painting.
      return new THREE.PlaneGeometry(2, 2, 24, 24)
    case 'torus':
      return new THREE.TorusGeometry(0.7, 0.28, 24, 64)
    case 'box':
    default:
      return new THREE.BoxGeometry(1, 1, 1, 3, 3, 3)
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
    // Aim local -Z at the origin so the light points at the scene by default.
    const dir = new THREE.Vector3(-3, -5, -4).normalize()
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir)
    node.transform.rotation = { x: q.x, y: q.y, z: q.z, w: q.w }
  }
  fragment.nodes[node.id] = node
  fragment.rootIds.push(node.id)
  return fragment
}
