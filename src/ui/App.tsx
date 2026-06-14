import { useEffect } from 'react'
import { ProjectRepository } from '../infrastructure/persistence/ProjectRepository.ts'
import { useAppStore } from '../state/useAppStore.ts'
import { useEditorStore } from '../state/useEditorStore.ts'
import { useEngineStore } from '../state/useEngineStore.ts'
import { useProjectStore } from '../state/useProjectStore.ts'
import { ConfirmDialog } from './components/ConfirmDialog.tsx'
import { Dashboard } from './dashboard/Dashboard.tsx'
import { EditorLayout } from './layout/EditorLayout.tsx'
import { saveCurrentProject } from './saveProject.ts'

const isEmptyProject = () =>
  Object.keys(useProjectStore.getState().project.scene.nodes).length === 0

export function App() {
  const view = useAppStore((s) => s.view)
  const project = useProjectStore((s) => s.project)

  // Debounced autosave — only in the editor and only once the scene has content,
  // so we never persist throwaway empty projects.
  useEffect(() => {
    if (view !== 'editor' || isEmptyProject()) return
    const handle = setTimeout(() => void saveCurrentProject(), 1500)
    return () => clearTimeout(handle)
  }, [project, view])

  // Before unload: drop empty projects, warn about unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const state = useProjectStore.getState()
      if (Object.keys(state.project.scene.nodes).length === 0) {
        void ProjectRepository.remove(state.project.meta.id)
        return
      }
      if (state.dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'SELECT'
      const projectStore = useProjectStore.getState()
      const editor = useEditorStore.getState()
      const key = e.key.toLowerCase()

      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault()
        void saveCurrentProject()
        editor.setStatus('Проект сохранён')
        return
      }
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault()
        useEngineStore.getState().engine?.invalidateGeometryCache()
        if (e.shiftKey) projectStore.redo()
        else projectStore.undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault()
        useEngineStore.getState().engine?.invalidateGeometryCache()
        projectStore.redo()
        return
      }

      if (typing) return
      if (useAppStore.getState().view !== 'editor') return

      if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selectedId) {
        projectStore.removeNode(editor.selectedId)
        editor.select(null)
      } else if (key === 'f') {
        useEngineStore.getState().engine?.focusSelected()
      } else if (key === 'w') editor.setTransformMode('translate')
      else if (key === 'e') editor.setTransformMode('rotate')
      else if (key === 'r') editor.setTransformMode('scale')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {view === 'dashboard' ? <Dashboard /> : <EditorLayout />}
      <ConfirmDialog />
    </>
  )
}
