import { ProjectRepository } from '../infrastructure/persistence/ProjectRepository.ts'
import { useEngineStore } from '../state/useEngineStore.ts'
import { useProjectStore } from '../state/useProjectStore.ts'

/** Saves the current project to IndexedDB with a fresh scene thumbnail + camera. */
export const saveCurrentProject = async (): Promise<void> => {
  const { project, markSaved } = useProjectStore.getState()
  const engine = useEngineStore.getState().engine
  const thumb = engine?.captureThumbnail()
  // Snapshot the live camera without polluting the undo history.
  const toSave = engine ? { ...project, camera: engine.getCameraState() } : project
  await ProjectRepository.save(toSave, thumb)
  markSaved()
}
