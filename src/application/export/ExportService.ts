import type * as THREE from 'three'
import type { Project } from '../../domain/project/Project.ts'
import { TEXTURE_SLOTS } from '../../domain/assets/MaterialAsset.ts'
import { downloadBlob } from '../../infrastructure/files/download.ts'
import { exportGltf } from './GltfExporter.ts'
import type { GltfJson } from './GltfExporter.ts'
import { packageGltfZip } from './ZipPackager.ts'

export type ExportFormat = 'glb' | 'gltf'

export interface ExportResult {
  filename: string
  /** What was actually produced (gltf may downgrade to a zip when textured). */
  kind: 'glb' | 'gltf' | 'zip'
}

/** True when any material in the project references a texture. */
export const projectHasTextures = (project: Project): boolean =>
  Object.values(project.assets.materials).some((m) =>
    TEXTURE_SLOTS.some((slot) => Boolean(m[slot])),
  )

/** The smart default: GLB when textured (single self-contained file), else GLTF. */
export const suggestedFormat = (project: Project): ExportFormat =>
  projectHasTextures(project) ? 'glb' : 'gltf'

/**
 * Exports the scene:
 *  - glb            -> single .glb with embedded textures
 *  - gltf, no maps  -> single .gltf
 *  - gltf, textured -> .zip (gltf + .bin + texture files)
 */
export const exportScene = async (
  root: THREE.Object3D,
  baseName: string,
  format: ExportFormat,
): Promise<ExportResult> => {
  if (format === 'glb') {
    const buffer = (await exportGltf(root, true)) as ArrayBuffer
    downloadBlob(buffer, `${baseName}.glb`, 'model/gltf-binary')
    return { filename: `${baseName}.glb`, kind: 'glb' }
  }

  const gltf = (await exportGltf(root, false)) as GltfJson
  const textured = (gltf.images?.length ?? 0) > 0
  if (textured) {
    const zip = packageGltfZip(gltf, baseName)
    downloadBlob(zip as unknown as ArrayBuffer, `${baseName}.zip`, 'application/zip')
    return { filename: `${baseName}.zip`, kind: 'zip' }
  }

  downloadBlob(JSON.stringify(gltf, null, 2), `${baseName}.gltf`, 'model/gltf+json')
  return { filename: `${baseName}.gltf`, kind: 'gltf' }
}
