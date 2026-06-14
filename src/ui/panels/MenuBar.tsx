import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { importAccept, importFile } from '../../application/import/ImportService.ts'
import { exportScene } from '../../application/export/ExportService.ts'
import type { ExportFormat } from '../../application/export/ExportService.ts'
import {
  createLightFragment,
  createPrimitiveFragment,
} from '../../application/scene/factory.ts'
import type { PrimitiveKind } from '../../application/scene/factory.ts'
import type { LightType } from '../../domain/nodes/lights.ts'
import type { SceneFragment } from '../../domain/project/SceneFragment.ts'
import { ProjectRepository } from '../../infrastructure/persistence/ProjectRepository.ts'
import type { ProjectSummary } from '../../infrastructure/persistence/ProjectRepository.ts'
import { confirmDialog } from '../../state/useConfirmStore.ts'
import { useAppStore } from '../../state/useAppStore.ts'
import { useEditorStore } from '../../state/useEditorStore.ts'
import { useEngineStore } from '../../state/useEngineStore.ts'
import { useLayoutStore } from '../../state/useLayoutStore.ts'
import type { PanelId } from '../../state/useLayoutStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'
import { Logo } from '../icons/Logo.tsx'
import { saveCurrentProject } from '../saveProject.ts'

const PRIMITIVES: PrimitiveKind[] = ['box', 'sphere', 'cylinder', 'plane', 'torus']
const LIGHTS: LightType[] = ['directional', 'point', 'spot', 'ambient', 'hemisphere']
const PANELS: { id: PanelId; label: string }[] = [
  { id: 'scene', label: 'Сцена' },
  { id: 'inspector', label: 'Инспектор' },
  { id: 'assets', label: 'Материалы и текстуры' },
  { id: 'uv', label: 'UV-развёртка' },
]

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [editingName, setEditingName] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const project = useProjectStore((s) => s.project)
  const dirty = useProjectStore((s) => s.dirty)
  const setProjectName = useProjectStore((s) => s.setProjectName)
  const setProject = useProjectStore((s) => s.setProject)
  const newProject = useProjectStore((s) => s.newProject)
  const mergeFragment = useProjectStore((s) => s.mergeFragment)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const canUndo = useProjectStore((s) => s.past.length > 0)
  const canRedo = useProjectStore((s) => s.future.length > 0)

  const setView = useAppStore((s) => s.setView)
  const hidden = useLayoutStore((s) => s.hidden)
  const toggleHidden = useLayoutStore((s) => s.toggleHidden)

  const selectedId = useEditorStore((s) => s.selectedId)
  const select = useEditorStore((s) => s.select)
  const status = useEditorStore((s) => s.status)
  const busy = useEditorStore((s) => s.busy)
  const setStatus = useEditorStore((s) => s.setStatus)
  const setBusy = useEditorStore((s) => s.setBusy)
  const removeNode = useProjectStore((s) => s.removeNode)

  const refreshProjects = () => ProjectRepository.list().then(setProjects)
  useEffect(() => {
    void refreshProjects()
  }, [])

  const toggle = (name: string) => setOpenMenu((cur) => (cur === name ? null : name))
  const hover = (name: string) => setOpenMenu((cur) => (cur ? name : cur))
  const close = () => setOpenMenu(null)

  const addFragment = (fragment: SceneFragment) => {
    mergeFragment(fragment)
    const root = fragment.rootIds[0]
    if (root) {
      select(root)
      requestAnimationFrame(() => useEngineStore.getState().engine?.focusSelected())
    }
  }

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        setStatus(`Импорт «${file.name}»…`)
        addFragment(await importFile(file))
      }
      setStatus('Импорт завершён')
    } catch (err) {
      console.error(err)
      setStatus(err instanceof Error ? err.message : 'Ошибка импорта')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onExport = async (format: ExportFormat) => {
    const engine = useEngineStore.getState().engine
    if (!engine) return
    setBusy(true)
    setStatus('Экспорт…')
    try {
      const res = await exportScene(engine.getExportRoot(), project.meta.name, format)
      setStatus(`Сохранено: ${res.filename} (${res.kind})`)
    } catch (err) {
      console.error(err)
      setStatus(err instanceof Error ? err.message : 'Ошибка экспорта')
    } finally {
      setBusy(false)
    }
  }

  const saveProject = async () => {
    await saveCurrentProject()
    await refreshProjects()
    setStatus('Проект сохранён')
  }
  const openProject = async (id: string) => {
    const loaded = await ProjectRepository.load(id)
    if (loaded) {
      select(null)
      setProject(loaded)
      setStatus(`Открыт «${loaded.meta.name}»`)
    }
  }
  const deleteProject = async () => {
    const ok = await confirmDialog({
      title: 'Удалить проект?',
      message: `«${project.meta.name}» будет удалён без возможности восстановления.`,
      confirmLabel: 'Удалить',
      danger: true,
    })
    if (!ok) return
    await ProjectRepository.remove(project.meta.id)
    await refreshProjects()
    setStatus('Проект удалён')
  }

  const newProjectGuarded = async () => {
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Создать новый проект?',
        message: 'Текущая история изменений будет очищена.',
        confirmLabel: 'Создать',
      })
      if (!ok) return
    }
    select(null)
    newProject()
  }

  const withUndoCache = (fn: () => void) => () => {
    useEngineStore.getState().engine?.invalidateGeometryCache()
    fn()
  }

  return (
    <div className="menubar">
      <input
        ref={fileRef}
        type="file"
        accept={importAccept}
        multiple
        hidden
        onChange={(e) => void onImport(e.target.files)}
      />

      {openMenu && <div className="menu-backdrop" onClick={close} />}

      <button className="logo" title="Все проекты" onClick={() => setView('dashboard')}>
        <Logo size={20} />
      </button>

      <Menu
        name="file"
        label="Файл"
        openMenu={openMenu}
        onToggle={toggle}
        onHover={hover}
        onClose={close}
        onOpen={() => void refreshProjects()}
      >
        <Item label="Все проекты…" onClick={() => setView('dashboard')} />
        <Separator />
        <Item label="Новый" shortcut="Ctrl+N" onClick={() => void newProjectGuarded()} />
        <SubMenu label="Открыть">
          {projects.length === 0 && <Item label="(пусто)" disabled onClick={() => {}} />}
          {projects.map((p) => (
            <Item
              key={p.id}
              label={p.name}
              onClick={() => void openProject(p.id)}
            />
          ))}
        </SubMenu>
        <Item label="Сохранить" shortcut="Ctrl+S" onClick={() => void saveProject()} />
        <Item label="Удалить проект" onClick={() => void deleteProject()} />
        <Separator />
        <Item label="Импорт…" onClick={() => fileRef.current?.click()} />
        <Item label="Экспорт GLB" onClick={() => void onExport('glb')} />
        <Item label="Экспорт GLTF / ZIP" onClick={() => void onExport('gltf')} />
      </Menu>

      <Menu
        name="edit"
        label="Правка"
        openMenu={openMenu}
        onToggle={toggle}
        onHover={hover}
        onClose={close}
      >
        <Item label="Отменить" shortcut="Ctrl+Z" disabled={!canUndo} onClick={withUndoCache(undo)} />
        <Item label="Повторить" shortcut="Ctrl+Y" disabled={!canRedo} onClick={withUndoCache(redo)} />
        <Separator />
        <Item
          label="Удалить узел"
          shortcut="Del"
          disabled={!selectedId}
          onClick={() => {
            if (selectedId) {
              removeNode(selectedId)
              select(null)
            }
          }}
        />
      </Menu>

      <Menu
        name="add"
        label="Добавить"
        openMenu={openMenu}
        onToggle={toggle}
        onHover={hover}
        onClose={close}
      >
        <SubMenu label="Примитив">
          {PRIMITIVES.map((p) => (
            <Item
              key={p}
              label={p}
              onClick={() => addFragment(createPrimitiveFragment(p))}
            />
          ))}
        </SubMenu>
        <SubMenu label="Свет">
          {LIGHTS.map((l) => (
            <Item key={l} label={l} onClick={() => addFragment(createLightFragment(l))} />
          ))}
        </SubMenu>
      </Menu>

      <Menu
        name="view"
        label="Вид"
        openMenu={openMenu}
        onToggle={toggle}
        onHover={hover}
        onClose={close}
      >
        <Item
          label="Фокус на выделении"
          shortcut="F"
          onClick={() => useEngineStore.getState().engine?.focusSelected()}
        />
        <Separator />
        {PANELS.map((p) => (
          <Item
            key={p.id}
            label={`${hidden[p.id] ? '☐' : '☑'}  ${p.label}`}
            onClick={() => toggleHidden(p.id)}
          />
        ))}
      </Menu>

      <div className="project-title">
        {editingName ? (
          <input
            autoFocus
            defaultValue={project.meta.name}
            onBlur={(e) => {
              setProjectName(e.target.value.trim() || project.meta.name)
              setEditingName(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditingName(false)
            }}
          />
        ) : (
          <span
            className="name"
            title="Двойной клик — переименовать"
            onDoubleClick={() => setEditingName(true)}
          >
            {project.meta.name}
          </span>
        )}
        <span
          className={`save-dot ${dirty ? 'dirty' : 'saved'}`}
          title={dirty ? 'Есть несохранённые изменения' : 'Сохранено'}
        >
          {dirty ? '● не сохранено' : '✓ сохранено'}
        </span>
      </div>

      <span className="spacer" />
      <span className="status">{busy ? '⏳ ' : ''}{status}</span>
    </div>
  )
}

function Menu(props: {
  name: string
  label: string
  openMenu: string | null
  onToggle: (name: string) => void
  onHover: (name: string) => void
  onClose: () => void
  onOpen?: () => void
  children: ReactNode
}) {
  const isOpen = props.openMenu === props.name
  return (
    <div className="menu" onMouseEnter={() => props.onHover(props.name)}>
      <button
        className={`menu-label${isOpen ? ' open' : ''}`}
        onClick={() => {
          if (!isOpen) props.onOpen?.()
          props.onToggle(props.name)
        }}
      >
        {props.label}
      </button>
      {isOpen && (
        <div className="menu-dropdown" onClick={props.onClose}>
          {props.children}
        </div>
      )}
    </div>
  )
}

function Item(props: {
  label: string
  shortcut?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <div
      className={`menu-item${props.disabled ? ' disabled' : ''}`}
      onClick={(e) => {
        if (props.disabled) {
          e.stopPropagation()
          return
        }
        props.onClick()
      }}
    >
      <span>{props.label}</span>
      {props.shortcut && <span className="shortcut">{props.shortcut}</span>}
    </div>
  )
}

function Separator() {
  return <div className="menu-sep" />
}

function SubMenu(props: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="submenu"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="menu-item" onClick={(e) => e.stopPropagation()}>
        <span>{props.label}</span>
      </div>
      {open && <div className="submenu-panel">{props.children}</div>}
    </div>
  )
}
