import { useRef, useState } from 'react'
import { importAccept, importFile } from '../../application/import/ImportService.ts'
import { exportScene } from '../../application/export/ExportService.ts'
import type { ExportFormat } from '../../application/export/ExportService.ts'
import { isMeshNode } from '../../domain/nodes/SceneNode.ts'
import { identityTransform } from '../../domain/scene/Transform.ts'
import type { TransformMode } from '../../engine/gizmos/TransformGizmo.ts'
import { SUB_OBJECT_MODES } from '../../engine/subobject/SubObjectMode.ts'
import type { SubObjectMode } from '../../engine/subobject/SubObjectMode.ts'
import { useEditorStore } from '../../state/useEditorStore.ts'
import { useEngineStore } from '../../state/useEngineStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'
import { Icon } from '../icons/Icon.tsx'
import type { IconName } from '../icons/Icon.tsx'
import { UVEditorModal } from './UVEditorModal.tsx'
import { hexStringToRgb, rgbToHexString } from './Inspector/widgets.tsx'

const TRANSFORM_MODES: { mode: TransformMode; icon: IconName; label: string }[] = [
  { mode: 'translate', icon: 'move', label: 'Перемещение (W)' },
  { mode: 'rotate', icon: 'rotate', label: 'Поворот (E)' },
  { mode: 'scale', icon: 'scale', label: 'Масштаб (R)' },
]

const SUB_LABEL: Record<SubObjectMode, { icon: IconName; label: string }> = {
  object: { icon: 'object', label: 'Объект' },
  vertex: { icon: 'vertex', label: 'Вершины' },
  edge: { icon: 'edge', label: 'Рёбра' },
  polygon: { icon: 'polygon', label: 'Полигоны' },
}

/** Slim strip of flat icon tool toggles; commands live in the menu bar. */
export function Toolbar() {
  const transformMode = useEditorStore((s) => s.transformMode)
  const setTransformMode = useEditorStore((s) => s.setTransformMode)
  const uniformScale = useEditorStore((s) => s.uniformScale)
  const setUniformScale = useEditorStore((s) => s.setUniformScale)
  const subObjectMode = useEditorStore((s) => s.subObjectMode)
  const setSubObjectMode = useEditorStore((s) => s.setSubObjectMode)

  const selectedId = useEditorStore((s) => s.selectedId)
  const node = useProjectStore((s) => (selectedId ? s.project.scene.nodes[selectedId] : undefined))
  const isMesh = node ? isMeshNode(node) : false
  const [uvOpen, setUvOpen] = useState(false)
  const paint = useEditorStore((s) => s.paint)
  const setPaint = useEditorStore((s) => s.setPaint)

  const mergeFragment = useProjectStore((s) => s.mergeFragment)
  const setTransform = useProjectStore((s) => s.setTransform)
  const select = useEditorStore((s) => s.select)
  const setStatus = useEditorStore((s) => s.setStatus)
  const setBusy = useEditorStore((s) => s.setBusy)
  const fileRef = useRef<HTMLInputElement>(null)

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        setStatus(`Импорт «${file.name}»…`)
        const fragment = await importFile(file)
        mergeFragment(fragment)
        const root = fragment.rootIds[0]
        if (root) {
          select(root)
          requestAnimationFrame(() => useEngineStore.getState().engine?.focusSelected())
        }
      }
      setStatus('Импорт завершён')
    } catch (err) {
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
      const project = useProjectStore.getState().project
      const res = await exportScene(engine.getExportRoot(), project.meta.name, format)
      setStatus(`Сохранено: ${res.filename} (${res.kind})`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Ошибка экспорта')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="toolbar">
      <input
        ref={fileRef}
        type="file"
        accept={importAccept}
        multiple
        hidden
        onChange={(e) => void onImport(e.target.files)}
      />
      <div className="group">
        <button className="uv-launch" title="Импорт модели" onClick={() => fileRef.current?.click()}>
          <Icon name="open" size={16} />
          Импорт
        </button>
        <button className="icon-btn" title="Экспорт GLB" onClick={() => void onExport('glb')}>
          <Icon name="export" size={16} />
        </button>
        <button className="uv-launch" title="Экспорт GLTF / ZIP" onClick={() => void onExport('gltf')}>
          <Icon name="export" size={16} />
          GLTF
        </button>
      </div>

      <div className="group">
        {TRANSFORM_MODES.map(({ mode, icon, label }) => (
          <button
            key={mode}
            className={`icon-btn${transformMode === mode ? ' active' : ''}`}
            onClick={() => setTransformMode(mode)}
            title={label}
          >
            <Icon name={icon} />
          </button>
        ))}
        <button
          className={`icon-btn${uniformScale ? ' active' : ''}`}
          onClick={() => setUniformScale(!uniformScale)}
          title="Равномерный масштаб (сохранять пропорции)"
        >
          <Icon name="grip" />
        </button>
        <button
          className="uv-launch"
          disabled={!node}
          onClick={() => selectedId && setTransform(selectedId, identityTransform())}
          title="Сбросить трансформацию (позиция 0, поворот 0, масштаб 1)"
        >
          Сброс
        </button>
      </div>

      <div className="group">
        {SUB_OBJECT_MODES.map((mode) => (
          <button
            key={mode}
            className={`icon-btn${subObjectMode === mode ? ' active' : ''}`}
            onClick={() => setSubObjectMode(mode)}
            title={SUB_LABEL[mode].label}
          >
            <Icon name={SUB_LABEL[mode].icon} />
          </button>
        ))}
      </div>

      <div className="group">
        <button
          className="uv-launch"
          disabled={!isMesh}
          title={isMesh ? 'Открыть редактор UV-развёртки' : 'Выберите меш'}
          onClick={() => setUvOpen(true)}
        >
          <Icon name="image" size={16} />
          UV-развёртка
        </button>
        <button
          className={`icon-btn${paint.active ? ' active' : ''}`}
          title="Кисть (рисование по вершинам)"
          onClick={() => setPaint({ active: !paint.active })}
        >
          <Icon name="brush" size={16} />
        </button>
        {paint.active && (
          <div className="paint-controls">
            <input
              type="color"
              title="Цвет кисти"
              value={rgbToHexString(paint.color)}
              onChange={(e) => setPaint({ color: hexStringToRgb(e.target.value) })}
            />
            <button
              className={`icon-btn${paint.mode === 'erase' ? ' active' : ''}`}
              title="Ластик (восстановить исходную текстуру)"
              onClick={() =>
                setPaint({ mode: paint.mode === 'erase' ? 'paint' : 'erase' })
              }
            >
              <Icon name="trash" size={16} />
            </button>
            <label title="Радиус">
              R
              <input
                type="range"
                min={0.05}
                max={3}
                step={0.05}
                value={paint.radius}
                onChange={(e) => setPaint({ radius: parseFloat(e.target.value) })}
              />
            </label>
            <label title="Сила">
              S
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={paint.strength}
                onChange={(e) => setPaint({ strength: parseFloat(e.target.value) })}
              />
            </label>
            <label title="Жёсткость края">
              H
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={paint.hardness}
                onChange={(e) => setPaint({ hardness: parseFloat(e.target.value) })}
              />
            </label>
          </div>
        )}
      </div>

      {uvOpen && <UVEditorModal onClose={() => setUvOpen(false)} />}
    </div>
  )
}
