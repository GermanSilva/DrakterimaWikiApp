import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { dismissFrame } from './dismissFade'
import { FACES, FACE_NUMBERS, VERTICES, createRollParams, faceIndexForRoll, rollPose } from './d20Orientation'
import { makeFaceTexture } from './faceTexture'

const RADIUS = 1.6
const CAMERA_HEIGHT = 9
const CAMERA_FOV = 46

const SR_ONLY = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
const HINT = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 24,
  margin: 0,
  textAlign: 'center',
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.7)',
  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  pointerEvents: 'none',
}

/**
 * Full-viewport, transparent WebGL overlay: a d20 is thrown onto the page as if it were a horizontal
 * monitor seen from above. The roll is DECIDED BY THE CALLER (the server): the die tumbles and settles
 * with the face of `roll` pointing at the camera (see rollPose), then `onComplete(roll)` fires once.
 *
 * While the die tumbles the layer is click-through and input is ignored. Once it has landed it STAYS on
 * screen and captures a click / tap / Escape / Enter / Space anywhere; that dismisses it with a
 * fade-out + zoom-in (see dismissFrame) and `onClose()` fires only after the fade ends, once.
 * Setup errors (no WebGL, roll outside 1-20) are thrown to the nearest error boundary.
 *
 * Mount it only while a throw is in progress; unmounting disposes the renderer and every listener.
 *
 * @param {{ roll: number, onComplete?: (roll: number) => void, onClose?: () => void }} props
 */
export default function D20Overlay({ roll, onComplete, onClose }) {
  const mountRef = useRef(null)
  const dismissRef = useRef(null)
  const [landed, setLanded] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [failure, setFailure] = useState(null)
  if (failure) throw failure // errors raised outside render (animation frames) reach the error boundary too

  const callbacks = useRef({ onComplete, onClose })
  useEffect(() => {
    callbacks.current = { onComplete, onClose }
  })

  useEffect(() => {
    const el = mountRef.current
    if (!el) return undefined
    faceIndexForRoll(roll) // throws for a roll outside 1-20 BEFORE any GPU resource exists

    // a new roll is a new throw: forget the previous one having landed / faded out
    setLanded(false)
    setDismissing(false)
    el.style.opacity = ''
    el.style.transform = ''

    let disposed = false
    let rafId = 0
    let phase = 'rolling' // rolling -> landed -> dismissing
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

    let startedAt = null
    const frame = (now) => {
      if (disposed) return
      try {
        if (startedAt === null) startedAt = now
        const pose = rollPose((now - startedAt) / 1000, params)
        apply(pose)
        renderer.render(scene, camera)
        if (pose.done) {
          phase = 'landed'
          setLanded(true)
          callbacks.current.onComplete?.(roll)
          return // at rest: nothing left to animate until the user dismisses it
        }
        rafId = requestAnimationFrame(frame)
      } catch (e) {
        setFailure(e)
      }
    }

    let fadeStartedAt = null
    const fadeFrame = (now) => {
      if (disposed) return
      if (fadeStartedAt === null) fadeStartedAt = now
      const f = dismissFrame(now - fadeStartedAt)
      el.style.opacity = String(f.opacity)
      el.style.transform = `scale(${f.scale})`
      if (f.done) {
        callbacks.current.onClose?.()
        return
      }
      rafId = requestAnimationFrame(fadeFrame)
    }

    /** Starts the fade-out + zoom-in. Only a landed die can be dismissed, and only once. */
    const dismiss = () => {
      if (disposed || phase !== 'landed') return
      phase = 'dismissing'
      setDismissing(true)
      rafId = requestAnimationFrame(fadeFrame)
    }
    dismissRef.current = dismiss

    const onResize = () => {
      camera.aspect = width() / height()
      camera.updateProjectionMatrix()
      renderer.setSize(width(), height())
      renderer.render(scene, camera)
    }
    const onKey = (e) => {
      if (phase !== 'landed') return
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault() // Space must not scroll the page nor press a focused button
        dismiss()
      }
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
      dismissRef.current = null
      cancelAnimationFrame(rafId)
      cleanups.forEach((fn) => fn())
      geo.dispose()
      edgeGeo.dispose()
      edgeMat.dispose()
      textures.forEach((t) => t.dispose())
      materials.forEach((m) => m.dispose())
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [roll])

  const dismiss = () => dismissRef.current?.()
  return (
    <div
      data-testid="d20-overlay"
      onPointerDown={dismiss}
      onClick={dismiss}
      style={{ position: 'fixed', inset: 0, zIndex: 400, pointerEvents: landed ? 'auto' : 'none', background: 'transparent', cursor: landed ? 'pointer' : 'auto' }}
    >
      <div ref={mountRef} aria-hidden="true" data-testid="d20-canvas" style={{ position: 'absolute', inset: 0, transformOrigin: '50% 50%' }} />
      {landed && (
        <div role="status" aria-live="polite" style={SR_ONLY}>
          {`Salió ${roll}. Tocá para continuar.`}
        </div>
      )}
      {landed && !dismissing && (
        <p aria-hidden="true" data-testid="d20-hint" style={HINT}>
          Tocá para continuar
        </p>
      )}
    </div>
  )
}
