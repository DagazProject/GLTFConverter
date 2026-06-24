import * as THREE from 'three'
import type { SceneNode } from '../../../domain/nodes/SceneNode.ts'
import type { Transform } from '../../../domain/scene/Transform.ts'
import { MIN_SCALE } from '../../../domain/scene/Transform.ts'
import { useProjectStore } from '../../../state/useProjectStore.ts'
import { Vec3Field } from './widgets.tsx'

const RAD2DEG = 180 / Math.PI
const DEG2RAD = Math.PI / 180

export function TransformPanel({ node }: { node: SceneNode }) {
  const setTransform = useProjectStore((s) => s.setTransform)
  const t = node.transform

  const euler = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w),
  )
  const rotationDeg = {
    x: euler.x * RAD2DEG,
    y: euler.y * RAD2DEG,
    z: euler.z * RAD2DEG,
  }

  const update = (patch: Partial<Transform>) =>
    setTransform(node.id, { ...t, ...patch })

  return (
    <div className="section">
      <h3>Трансформация</h3>
      <Vec3Field
        label="Позиция"
        value={t.position}
        onChange={(position) => update({ position })}
      />
      <Vec3Field
        label="Поворот°"
        value={rotationDeg}
        step={1}
        onChange={(deg) => {
          const q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(deg.x * DEG2RAD, deg.y * DEG2RAD, deg.z * DEG2RAD),
          )
          update({ rotation: { x: q.x, y: q.y, z: q.z, w: q.w } })
        }}
      />
      <Vec3Field
        label="Масштаб"
        value={t.scale}
        min={MIN_SCALE}
        onChange={(scale) => update({ scale })}
      />
    </div>
  )
}
