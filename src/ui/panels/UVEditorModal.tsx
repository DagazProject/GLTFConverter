import { useEffect, useState } from 'react'
import { isMeshNode } from '../../domain/nodes/SceneNode.ts'
import { useEditorStore } from '../../state/useEditorStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'
import { MeshPreview } from './MeshPreview.tsx'
import { UVCanvas } from './UVCanvas.tsx'

/** Large UV workspace: live model preview beside the full UV editor. */
export function UVEditorModal({ onClose }: { onClose: () => void }) {
  const selectedId = useEditorStore((s) => s.selectedId)
  const node = useProjectStore((s) => (selectedId ? s.project.scene.nodes[selectedId] : undefined))
  const mesh = node && isMeshNode(node) ? node : null
  const [showChecker, setShowChecker] = useState(true)

  const setUvSelection = useEditorStore((s) => s.setUvSelection)
  useEffect(() => {
    setUvSelection([])
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      setUvSelection([])
    }
  }, [onClose, setUvSelection])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal uv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="uv-modal-head">
          <h2>Редактор UV-развёртки{mesh ? ` — ${mesh.name}` : ''}</h2>
          <button onClick={onClose}>Закрыть</button>
        </div>
        {mesh ? (
          <div className="uv-modal-body">
            <div className="uv-modal-preview">
              <div className="uv-preview-head">
                <span className="set-label">Модель</span>
                <label className="set-row" style={{ padding: 0 }}>
                  <input
                    type="checkbox"
                    checked={showChecker}
                    onChange={(e) => setShowChecker(e.target.checked)}
                  />
                  UV-шахматка
                </label>
              </div>
              <MeshPreview node={mesh} showChecker={showChecker} />
            </div>
            <div className="uv-modal-canvas">
              <UVCanvas />
            </div>
          </div>
        ) : (
          <p className="hint">Выберите меш в сцене, чтобы открыть его развёртку.</p>
        )}
      </div>
    </div>
  )
}
