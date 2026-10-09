import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { FACES, FACE_NUMBERS, VERTICES, createRollParams, rollPose } from './d20Orientation'
import { makeFaceTexture } from './faceTexture'

const RADIUS = 1.6
const CAMERA_HEIGHT = 9
const CAMERA_FOV = 46

/**
 * Full-viewport, transparent, click-through WebGL overlay: a d20 is thrown onto the page as if it
 * were a horizontal monitor seen from above. The roll is DECIDED BY THE CALLER (the server): the die
 * tumbles and settles with the face of `roll` pointing at the camera (see rollPose), then
 * `onComplete(roll)` fires once and, after `holdMs`, `onClose()` (Escape closes it right away).
 *
 * Mount it only while a throw is in progress; unmounting disposes the renderer and every listener.
 *
 * @param {{ roll: number, onComplete?: (roll: number) => void, onClose?: () => void, holdMs?: number }} props
 */
export default function D20Overlay({ roll, onComplete, onClose, holdMs = 1600 }) {
  const mountRef = useRef(null)
  const callbacks = useRef({ onComplete, onClose })
  useEffect(() => {
    callbacks.current = { onComplete, onClose }
  })

  useEffect(() => {
    const el = mountRef.current
    if (!el) return undefined

    let disposed = false
    let rafId = 0
    let holdTimer = 0
    let finished = false
    const cleanups = []

    const width = () => window.innerWidth || 1
    const height = () => window.innerHeight || 1

    // Top-down camera: screen-up = world -Z, screen-right = world +X
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width() / height(), 0.1, 100)
    camera.up.set(0, 0, -1)
    camera.position.set(0, CAMERA_HEIGHT, 0)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(width(), height())
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.display = 'block'
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const key = new THREE.DirectionalLight(0xffffff, 0.95)
    key.position.set(2, 8, 2)
    scene.add(key)

    // Flat-shaded, non-indexed icosahedron: one material (number) per face, number upright toward vertex 0
    const positions = new Float32Array(60 * 3)
    const uvs = new Float32Array(60 * 2)
    const vertexScale = RADIUS / Math.hypot(...VERTICES[0])
    const R = 0.42
    const S30 = Math.cos(Math.PI / 6)
    const uvCorners = [
      [0.5, 0.5 + R],
      [0.5 - R * S30, 0.5 - R * 0.5],
      [0.5 + R * S30, 0.5 - R * 0.5],
    ]
    FACES.forEach((face, i) => {
      face.forEach((v, k) => {
        positions.set(VERTICES[v].map((c) => c * vertexScale), (i * 3 + k) * 3)
        uvs.set(uvCorners[k], (i * 3 + k) * 2)
      })
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geo.computeVertexNormals()
    for (let i = 0; i < FACES.length; i++) geo.addGroup(i * 3, 3, i)
    const textures = FACE_NUMBERS.map((n) => makeFaceTexture(n))
    const materials = textures.map((map) => new THREE.MeshPhongMaterial({ map, shininess: 55 }))
    const dice = new THREE.Mesh(geo, materials)
    const edgeGeo = new THREE.EdgesGeometry(geo)
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.6 })
    dice.add(new THREE.LineSegments(edgeGeo, edgeMat))
    scene.add(dice)

    // enters from beyond the top-right corner of the viewport
    const halfH = Math.tan((CAMERA_FOV / 2) * (Math.PI / 180)) * CAMERA_HEIGHT
    const halfW = halfH * (width() / height())
    const params = createRollParams(roll, [halfW + RADIUS * 2, 0, -(halfH + RADIUS * 2)])

    const apply = (pose) => {
      dice.position.set(...pose.position)
      dice.quaternion.set(...pose.quaternion)
      dice.scale.setScalar(pose.scale)
    }
    apply(rollPose(0, params))

    const close = () => {
      if (disposed) return
      callbacks.current.onClose?.()
    }

    let startedAt = null
    const frame = (now) => {
      if (disposed) return
      if (startedAt === null) startedAt = now
      const pose = rollPose((now - startedAt) / 1000, params)
      apply(pose)
      renderer.render(scene, camera)
      if (pose.done) {
        if (!finished) {
          finished = true
          callbacks.current.onComplete?.(roll)
          holdTimer = window.setTimeout(close, holdMs)
        }
        return // at rest: nothing left to animate
      }
      rafId = requestAnimationFrame(frame)
    }

    const onResize = () => {
      camera.aspect = width() / height()
      camera.updateProjectionMatrix()
      renderer.setSize(width(), height())
      renderer.render(scene, camera)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    cleanups.push(() => window.removeEventListener('resize', onResize), () => window.removeEventListener('keydown', onKey))

    // the number font is optional: draw without waiting forever for it
    const fonts = document.fonts?.load?.('bold 1px "Exo 2"')
    Promise.resolve(fonts)
      .catch(() => undefined)
      .then(() => {
        if (!disposed) rafId = requestAnimationFrame(frame)
      })

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      window.clearTimeout(holdTimer)
      cleanups.forEach((fn) => fn())
      geo.dispose()
      edgeGeo.dispose()
      edgeMat.dispose()
      textures.forEach((t) => t.dispose())
      materials.forEach((m) => m.dispose())
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [roll, holdMs])

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      data-testid="d20-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 400, pointerEvents: 'none', background: 'transparent' }}
    />
  )
}
