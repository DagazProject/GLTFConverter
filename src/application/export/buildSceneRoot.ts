import * as THREE from 'three'
import type { Project } from '../../domain/project/Project.ts'
import { SceneSynchronizer } from '../../engine/SceneSynchronizer.ts'

/**
 * Builds a detached three.js scene root from a Project without a renderer,
 * so projects can be exported straight from the dashboard.
 */
export const buildSceneRoot = (project: Project): THREE.Object3D => {
  const root = new THREE.Group()
  const sync = new SceneSynchronizer(root, project)
  sync.sync(project)
  return root
}
