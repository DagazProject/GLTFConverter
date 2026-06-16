import type * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

export type GltfJson = Record<string, unknown> & {
  images?: unknown[]
  buffers?: { uri?: string }[]
}

/** Promise wrapper around three's GLTFExporter. */
export const exportGltf = (
  root: THREE.Object3D,
  binary: boolean,
): Promise<ArrayBuffer | GltfJson> =>
  new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      root,
      (result) => resolve(result as ArrayBuffer | GltfJson),
      (err) => reject(err),
      { binary, embedImages: true },
    )
  })
