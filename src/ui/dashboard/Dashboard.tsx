import { useEffect, useState } from 'react'
import { buildSceneRoot } from '../../application/export/buildSceneRoot.ts'
import { exportScene } from '../../application/export/ExportService.ts'
import { ProjectRepository } from '../../infrastructure/persistence/ProjectRepository.ts'
import type { ProjectSummary } from '../../infrastructure/persistence/ProjectRepository.ts'
import { confirmDialog } from '../../state/useConfirmStore.ts'
import { useAppStore } from '../../state/useAppStore.ts'
import { useEditorStore } from '../../state/useEditorStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'
import { Icon } from '../icons/Icon.tsx'
import { Logo } from '../icons/Logo.tsx'

export function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)

  const setProject = useProjectStore((s) => s.setProject)
  const newProject = useProjectStore((s) => s.newProject)
  const setView = useAppStore((s) => s.setView)
  const select = useEditorStore((s) => s.select)
  const setStatus = useEditorStore((s) => s.setStatus)

  const refresh = () => ProjectRepository.list().then(setProjects)
  useEffect(() => {
    void refresh()
  }, [])

  const openProject = async (id: string) => {
    const loaded = await ProjectRepository.load(id)
    if (!loaded) return
    select(null)
    setProject(loaded)
    setView('editor')
  }

  const createProject = () => {
    select(null)
    newProject('Новый проект')
    setView('editor')
  }

  const renameProject = async (id: string, name: string) => {
    const loaded = await ProjectRepository.load(id)
    if (loaded) {
      loaded.meta.name = name
      loaded.meta.updatedAt = Date.now()
      await ProjectRepository.save(loaded)
      await refresh()
    }
    setRenaming(null)
  }

  const deleteProject = async (id: string, name: string) => {
    const ok = await confirmDialog({
      title: 'Удалить проект?',
      message: `«${name}» будет удалён без возможности восстановления.`,
      confirmLabel: 'Удалить',
      danger: true,
    })
    if (!ok) return
    await ProjectRepository.remove(id)
    await refresh()
  }

  const exportProject = async (id: string, name: string) => {
    const loaded = await ProjectRepository.load(id)
    if (!loaded) return
    setStatus('Экспорт…')
    const root = buildSceneRoot(loaded)
    // Let data-URL textures decode before the exporter reads them.
    await new Promise((r) => setTimeout(r, 200))
    await exportScene(root, name, 'glb')
    setStatus(`Экспортировано: ${name}.glb`)
  }

  return (
    <div className="dashboard">
      <header className="dashboard-head">
        <Logo size={34} />
        <div>
          <h1>GLTF Studio</h1>
          <p>Импорт, редактирование и экспорт 3D-моделей в glTF / GLB / ZIP</p>
        </div>
        <span className="spacer" />
      </header>

      <div className="project-grid">
        <button className="project-card new-card" onClick={createProject}>
          <Icon name="plus" size={32} />
          <span>Новый проект</span>
        </button>

        {projects.map((p) => (
          <div className="project-card" key={p.id}>
            <div className="thumb" onClick={() => void openProject(p.id)}>
              {p.thumbnail ? (
                <img src={p.thumbnail} alt={p.name} />
              ) : (
                <div className="thumb-empty">
                  <Icon name="mesh" size={36} />
                </div>
              )}
            </div>
            <div className="card-body">
              {renaming === p.id ? (
                <input
                  autoFocus
                  defaultValue={p.name}
                  onBlur={(e) => void renameProject(p.id, e.target.value || p.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                />
              ) : (
                <div className="card-name" onDoubleClick={() => setRenaming(p.id)}>
                  {p.name}
                </div>
              )}
              <div className="card-date">{new Date(p.updatedAt).toLocaleString('ru')}</div>
              <div className="card-actions">
                <button className="mini primary" onClick={() => void openProject(p.id)}>
                  <Icon name="open" size={14} /> Открыть
                </button>
                <button className="mini" title="Экспорт GLB" onClick={() => void exportProject(p.id, p.name)}>
                  <Icon name="export" size={14} />
                </button>
                <button className="mini" title="Переименовать" onClick={() => setRenaming(p.id)}>
                  ✎
                </button>
                <button className="mini" title="Удалить" onClick={() => void deleteProject(p.id, p.name)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
