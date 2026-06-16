import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { MeshNode } from '../../domain/nodes/SceneNode.ts'
import { AssetFactory } from '../../engine/asset/AssetFactory.ts'
import { useEditorStore } from '../../state/useEditorStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'

const makeCheckerTexture = (): THREE.CanvasTexture => {
  const n = 8
  const cell = 64
  const c = document.createElement('canvas')
  c.width = c.height = n * cell
  const ctx = c.getContext('2d')!
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#9fb4d4' : '#41506b'
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 2
  for (let i = 0; i <= n; i++) {
    ctx.beginPath()
    ctx.moveTo(i * cell, 0)
    ctx.lineTo(i * cell, n * cell)
    ctx.moveTo(0, i * cell)
    ctx.lineTo(n * cell, i * cell)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Interactive 3D preview of one mesh; can show a UV checker + selected UVs. */
export function MeshPreview({ node, showChecker }: { node: MeshNode; showChecker: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const assets = useProjectStore((s) => s.project.assets)
  const geometry = assets.geometries[node.geometryId]
  const uvSelection = useEditorStore((s) => s.uvSelection)

  const sceneRef = useRef<THREE.Scene | null>(null)
  const posRef = useRef<number[]>([])
  const selPointsRef = useRef<THREE.Points | null>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    sceneRef.current = scene
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    const dir = new THREE.DirectionalLight(0xffffff, 2)
    dir.position.set(3, 5, 4)
    scene.add(dir)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    const factory = new AssetFactory(assets)
    const geo = factory.getGeometry(node.geometryId)
    const checker = showChecker ? makeCheckerTexture() : null
    const material = checker
      ? new THREE.MeshStandardMaterial({ map: checker, roughness: 0.85, metalness: 0 })
      : factory.buildMaterials(node.materialIds)
    const mesh = new THREE.Mesh(geo, material)
    scene.add(mesh)

    // Cache positions and a points object for highlighting selected UV verts.
    const posAttr = geo.getAttribute('position')
    posRef.current = posAttr ? Array.from(posAttr.array as ArrayLike<number>) : []
    const selPoints = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, color: 0xffce54, depthTest: false }),
    )
    selPoints.renderOrder = 999
    scene.add(selPoints)
    selPointsRef.current = selPoints

    const sphere = new THREE.Box3().setFromObject(mesh).getBoundingSphere(new THREE.Sphere())
    const dist = (sphere.radius || 1) / Math.sin((45 * Math.PI) / 360) + sphere.radius
    controls.target.copy(sphere.center)
    camera.position
      .copy(sphere.center)
      .add(new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(dist))

    // Click a face on the model to select its UV vertices in the editor.
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const down = { x: 0, y: 0 }
    const onDown = (e: PointerEvent) => {
      down.x = e.clientX
      down.y = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObject(mesh, false)[0]
      if (!hit?.face) return
      const { a, b, c } = hit.face
      const store = useEditorStore.getState()
      const base = e.shiftKey ? store.uvSelection : []
      store.setUvSelection([...new Set([...base, a, b, c])])
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const resize = () => {
      const w = container.clientWidth || 1
      const h = container.clientHeight || 1
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      ro.disconnect()
      controls.dispose()
      factory.dispose()
      checker?.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
      selPointsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, geometry, showChecker])

  // Highlight the selected UV vertices on the model.
  useEffect(() => {
    const points = selPointsRef.current
    const pos = posRef.current
    if (!points || pos.length === 0) return
    const coords: number[] = []
    for (const i of uvSelection) {
      if (i * 3 + 2 < pos.length) coords.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
    }
    points.geometry.dispose()
    points.geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(coords, 3),
    )
  }, [uvSelection])

  return <div className="mesh-preview" ref={ref} />
}
