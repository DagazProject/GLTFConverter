import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js'
import { JSONLoader } from './legacy/jsonLoader.js'

const decode = (data: ArrayBuffer | string): string =>
  typeof data === 'string' ? data : new TextDecoder().decode(data)

const meshFromGeometry = (geo: THREE.BufferGeometry): THREE.Object3D => {
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.85, metalness: 0.05 }),
  )
  return mesh
}

export const loadGltf = (data: ArrayBuffer | string): Promise<THREE.Object3D> =>
  new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      data,
      '',
      (gltf) => resolve(gltf.scene ?? gltf.scenes?.[0] ?? new THREE.Group()),
      (err) => reject(err),
    )
  })

export const loadObj = (data: ArrayBuffer | string): THREE.Object3D =>
  new OBJLoader().parse(decode(data))

export const loadFbx = (data: ArrayBuffer | string): THREE.Object3D =>
  new FBXLoader().parse(data as ArrayBuffer, '')

export const loadCollada = (data: ArrayBuffer | string): THREE.Object3D => {
  const result = new ColladaLoader().parse(decode(data), '')
  return result?.scene ?? new THREE.Group()
}

export const loadStl = (data: ArrayBuffer | string): THREE.Object3D =>
  meshFromGeometry(new STLLoader().parse(data))

export const loadPly = (data: ArrayBuffer | string): THREE.Object3D =>
  meshFromGeometry(new PLYLoader().parse(data))

export const load3mf = (data: ArrayBuffer | string): THREE.Object3D =>
  new ThreeMFLoader().parse(data as ArrayBuffer)

export const loadUsdz = (data: ArrayBuffer | string): THREE.Object3D =>
  new USDZLoader().parse(data as ArrayBuffer)

export const loadLegacyJson = (data: ArrayBuffer | string): THREE.Object3D => {
  const json = JSON.parse(decode(data))
  if ((json.metadata?.formatVersion ?? json.metadata?.version ?? 0) < 4) {
    return new JSONLoader().parse(json)
  }
  return new THREE.ObjectLoader().parse(json)
}
