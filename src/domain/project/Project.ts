import type { RGB } from '../math/types.ts'
import { rgb } from '../math/types.ts'
import type { AssetRegistry } from '../assets/AssetRegistry.ts'
import { emptyAssetRegistry } from '../assets/AssetRegistry.ts'
import type { SceneGraph } from '../scene/SceneGraph.ts'
import { emptySceneGraph } from '../scene/SceneGraph.ts'
import { newNodeId } from '../scene/ids.ts'

/** Current on-disk schema version, bumped on breaking changes. */
export const PROJECT_SCHEMA_VERSION = 1

export interface ProjectMeta {
  id: string
  name: string
  schemaVersion: number
  createdAt: number
  updatedAt: number
}

export interface EnvironmentSettings {
  background: RGB
}

/** Aggregate root: everything needed to render, persist and export a scene. */
export interface Project {
  meta: ProjectMeta
  scene: SceneGraph
  assets: AssetRegistry
  environment: EnvironmentSettings
}

export const createEmptyProject = (name = 'Untitled'): Project => {
  const now = Date.now()
  return {
    meta: {
      id: newNodeId(),
      name,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    },
    scene: emptySceneGraph(),
    assets: emptyAssetRegistry(),
    environment: { background: rgb(0.2, 0.21, 0.23) },
  }
}

/** Deep, JSON-safe clone used for persistence and the undo stack. */
export const cloneProject = (project: Project): Project =>
  typeof structuredClone === 'function'
    ? structuredClone(project)
    : (JSON.parse(JSON.stringify(project)) as Project)
