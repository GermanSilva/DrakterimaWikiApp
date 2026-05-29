import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// ─── face textures ────────────────────────────────────────────────────────────

function makeFaceTex(num) {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#6b1515'
  ctx.fillRect(0, 0, size, size)

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.35)
  grad.addColorStop(0, 'rgba(255,255,255,0.10)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)

  const fontSize = Math.round(size * 0.24)
  ctx.font         = `bold ${fontSize}px "Exo 2", sans-serif`
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin     = 'round'
  ctx.strokeStyle  = 'rgba(0,0,0,0.80)'
  ctx.lineWidth    = Math.round(fontSize * 0.18)
  ctx.strokeText(String(num), size / 2, size / 2)
  ctx.fillStyle    = '#ffffff'
  ctx.fillText(String(num), size / 2, size / 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ─── wood table backdrop ──────────────────────────────────────────────────────

function makeWoodTex() {
  const size = 512
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const half = size / 2

  // Plank colors — dark warm brown tones
  const planks = ['#3d1a06', '#5c2c0c', '#4a2208', '#60300e', '#3a1805']
  const pw = 30   // plank pixel width (before diagonal)

  function diagonalPlanks(clipY, clipH, angle) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, clipY, size, clipH)
    ctx.clip()
    ctx.translate(size / 2, clipY + clipH / 2)
    ctx.rotate(angle)

    const n = Math.ceil(size * 2 / pw) + 4
    for (let i = -n; i <= n; i++) {
      const ci = ((i % planks.length) + planks.length) % planks.length
      const lighter = planks[(ci + 2) % planks.length]
      const x = i * pw

      const g = ctx.createLinearGradient(x, 0, x + pw, 0)
      g.addColorStop(0,    planks[ci])
      g.addColorStop(0.4,  lighter)
      g.addColorStop(0.6,  lighter)
      g.addColorStop(1,    planks[ci])
      ctx.fillStyle = g
      ctx.fillRect(x + 1, -size * 2, pw - 2, size * 4)

      // Grain lines (procedural wood grain)
      ctx.save()
      ctx.globalAlpha = 0.08
      for (let g2 = 0; g2 < 6; g2++) {
        const gy = (Math.random() * 2 - 1) * size * 1.5
        ctx.strokeStyle = lighter
        ctx.lineWidth = 0.6
        ctx.beginPath()
        ctx.moveTo(x + 2, gy)
        ctx.bezierCurveTo(
          x + pw * 0.3, gy + (Math.random() * 14 - 7),
          x + pw * 0.7, gy + (Math.random() * 14 - 7),
          x + pw - 2, gy + (Math.random() * 10 - 5)
        )
        ctx.stroke()
      }
      ctx.restore()

      // Seam
      ctx.fillStyle = 'rgba(12, 4, 1, 0.75)'
      ctx.fillRect(x, -size * 2, 1.5, size * 4)
    }
    ctx.restore()
  }

  // Base fill
  ctx.fillStyle = '#3a1806'
  ctx.fillRect(0, 0, size, size)

  // Chevron: top half → /, bottom half → \
  diagonalPlanks(0,    half, -Math.PI / 4)
  diagonalPlanks(half, half,  Math.PI / 4)

  // Seam line where the two halves meet
  ctx.fillStyle = 'rgba(10, 3, 1, 0.85)'
  ctx.fillRect(0, half - 1, size, 2.5)

  // Vignette for realism
  const vg = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.72)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.38)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2.5, 2.5)
  return tex
}

// ─── geometry helpers ─────────────────────────────────────────────────────────

function faceNormalOf(geo, faceIdx) {
  const pos = geo.attributes.position
  const i   = faceIdx * 3
  const a   = new THREE.Vector3().fromBufferAttribute(pos, i)
  const b   = new THREE.Vector3().fromBufferAttribute(pos, i + 1)
  const c   = new THREE.Vector3().fromBufferAttribute(pos, i + 2)
  return new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3())
}

function buildFaceNumbers(geo) {
  const pos = geo.attributes.position
  const centroids = Array.from({ length: 20 }, (_, i) => {
    const j = i * 3
    return new THREE.Vector3()
      .fromBufferAttribute(pos, j)
      .add(new THREE.Vector3().fromBufferAttribute(pos, j + 1))
      .add(new THREE.Vector3().fromBufferAttribute(pos, j + 2))
      .divideScalar(3).normalize()
  })
  const opposite = new Array(20).fill(-1)
  for (let i = 0; i < 20; i++)
    for (let j = i + 1; j < 20; j++)
      if (centroids[i].dot(centroids[j]) < -0.99 && opposite[i] === -1) {
        opposite[i] = j; opposite[j] = i
      }
  const nums  = new Array(20).fill(0)
  const pairs = [[1,20],[2,19],[3,18],[4,17],[5,16],[6,15],[7,14],[8,13],[9,12],[10,11]]
  const done  = new Set(); let pi = 0
  for (let i = 0; i < 20; i++) {
    if (!done.has(i) && opposite[i] !== -1) {
      nums[i] = pairs[pi][0]; nums[opposite[i]] = pairs[pi][1]
      done.add(i); done.add(opposite[i]); pi++
    }
  }
  return nums
}

// Face most aligned with +Y (world up = camera direction from above)
function detectTopFace(dice, geo, faceNumbers) {
  const worldUp = new THREE.Vector3(0, 1, 0)
  const localUp = worldUp.clone().applyQuaternion(dice.quaternion.clone().invert())
  let best = 0, bestDot = -Infinity
  for (let i = 0; i < 20; i++) {
    const d = faceNormalOf(geo, i).dot(localUp)
    if (d > bestDot) { bestDot = d; best = i }
  }
  return { faceIdx: best, number: faceNumbers[best] }
}

// ─── animation constants ──────────────────────────────────────────────────────

const THROW_DUR  = 0.42   // die slides in from off-screen
const THROW_FROM = new THREE.Vector3(5, 0, -4)  // off-screen top-right

const BOUNCE_DUR = 0.90   // scale-bounce phase
const BOUNCE_A   = 1.2    // peak zoom amplitude (scale = 1 + BOUNCE_A at peak)
const BOUNCE_W   = 12.0   // rad/s
const BOUNCE_D   = 3.8    // decay

const STOP_SPEED = 0.5    // rad/s to trigger settle→snap
const SNAP_DUR   = 0.70   // face alignment slerp duration

// ─── component ────────────────────────────────────────────────────────────────

export default function Dice3D({ rolling, onAnimationComplete }) {
  const mountRef   = useRef(null)
  const triggerRef = useRef(null)
  const onDoneRef  = useRef(onAnimationComplete)
  onDoneRef.current = onAnimationComplete

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    let mounted = true
    const s = { rafId: null, dispose: null }

    document.fonts.load('bold 1px "Exo 2"').finally(() => {
      if (!mounted) return

      const W = el.offsetWidth  || 220
      const H = el.offsetHeight || 220

      /* ─── Scene ─────────────────────────────────────────── */
      const scene  = new THREE.Scene()

      // Overhead camera (cenital) — true top-down view
      const camera = new THREE.PerspectiveCamera(46, W / H, 0.1, 100)
      camera.position.set(0, 6, 0)
      camera.lookAt(0, 0, 0)
      camera.up.set(0, 0, -1)   // screen-up = world -Z

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(W, H)
      renderer.setClearColor(0x000000, 0)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      el.appendChild(renderer.domElement)

      /* ─── Lighting ──────────────────────────────────────── */
      scene.add(new THREE.AmbientLight(0xffffff, 0.80))
      const key = new THREE.DirectionalLight(0xffffff, 0.95)
      key.position.set(2, 8, 2)
      scene.add(key)
      const fill = new THREE.DirectionalLight(0xffffff, 0.25)
      fill.position.set(-4, 2, -3)
      scene.add(fill)

      /* ─── Wood table backdrop ───────────────────────────── */
      const bgTex = makeWoodTex()
      const bgMat = new THREE.MeshBasicMaterial({ map: bgTex })
      const bgPlane = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), bgMat)
      bgPlane.rotation.x = -Math.PI / 2   // horizontal plane
      bgPlane.position.y = -2.0            // below die (table surface)
      scene.add(bgPlane)

      /* ─── Dice geometry ─────────────────────────────────── */
      const baseGeo     = new THREE.IcosahedronGeometry(1.6, 0)
      const geo         = baseGeo.toNonIndexed()
      geo.computeVertexNormals()
      const faceNumbers = buildFaceNumbers(geo)

      const R = 0.42, S30 = Math.cos(Math.PI / 6)
      const uvArr = new Float32Array(60 * 2)
      for (let i = 0; i < 20; i++) {
        const b = i * 6
        uvArr[b]     = 0.5;            uvArr[b + 1] = 0.5 + R
        uvArr[b + 2] = 0.5 - R * S30; uvArr[b + 3] = 0.5 - R * 0.5
        uvArr[b + 4] = 0.5 + R * S30; uvArr[b + 5] = 0.5 - R * 0.5
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2))
      for (let i = 0; i < 20; i++) geo.addGroup(i * 3, 3, i)

      const textures  = faceNumbers.map(makeFaceTex)
      const materials = textures.map(map =>
        new THREE.MeshPhongMaterial({ map, shininess: 55 })
      )
      const dice = new THREE.Mesh(geo, materials)
      scene.add(dice)

      const edgeGeo = new THREE.EdgesGeometry(baseGeo)
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.60 })
      dice.add(new THREE.LineSegments(edgeGeo, edgeMat))

      /* ─── State ─────────────────────────────────────────── */
      // phase: 'idle' | 'throw' | 'bounce' | 'settle' | 'snap' | 'done'
      const rs = {
        phase: 'idle', elapsed: 0,
        vx: 0, vy: 0, vz: 0,
        snapFrom: new THREE.Quaternion(),
        targetQuat: null, roll: 0,
      }
      // Parallax accumulator — driven by die's angular velocity
      const bgOff = { x: 0, y: 0 }
      let prevRotX = 0
      let prevRotZ = 0

      triggerRef.current = () => {
        rs.vx = (Math.random() - 0.5) * 30
        rs.vy = (Math.random() - 0.5) * 30
        rs.vz = (Math.random() - 0.5) * 15
        rs.phase   = 'throw'
        rs.elapsed = 0
        dice.position.copy(THROW_FROM)
        dice.scale.setScalar(1)
      }

      /* ─── Frame loop ────────────────────────────────────── */
      let prev = 0
      function frame(t) {
        s.rafId = requestAnimationFrame(frame)
        const dt = Math.min((t - prev) / 1000, 0.05)
        prev = t
        rs.elapsed += dt

        // Parallax: rotation delta per frame — stops instantly when die stops
        const rawDX = dice.rotation.x - prevRotX
        const rawDZ = dice.rotation.z - prevRotZ
        const dX = Math.abs(rawDX) > 0.5 ? 0 : rawDX   // absorb gimbal-lock jumps
        const dZ = Math.abs(rawDZ) > 0.5 ? 0 : rawDZ
        bgOff.x -= dZ * 0.06
        bgOff.y -= dX * 0.06
        prevRotX = dice.rotation.x
        prevRotZ = dice.rotation.z
        bgTex.offset.x = bgOff.x
        bgTex.offset.y = bgOff.y

        switch (rs.phase) {

          case 'throw': {
            // Free spin while die enters from upper-right
            dice.rotation.x += rs.vx * dt
            dice.rotation.y += rs.vy * dt
            dice.rotation.z += rs.vz * dt

            const p  = Math.min(rs.elapsed / THROW_DUR, 1)
            const ep = 1 - Math.pow(1 - p, 2)            // ease-out X
            dice.position.x = THROW_FROM.x * (1 - ep)
            dice.position.z = THROW_FROM.z * (1 - p * p) // quadratic "gravity" in Z

            if (rs.elapsed >= THROW_DUR) {
              dice.position.set(0, 0, 0)
              rs.phase = 'bounce'; rs.elapsed = 0
            }
            break
          }

          case 'bounce': {
            // Spin with gradual table friction
            dice.rotation.x += rs.vx * dt
            dice.rotation.y += rs.vy * dt
            dice.rotation.z += rs.vz * dt
            const fr = Math.exp(-2.8 * dt)
            rs.vx *= fr; rs.vy *= fr; rs.vz *= fr

            // Scale = zoom effect (die bouncing up = appears closer = larger)
            const bt = rs.elapsed
            const height = Math.max(
              0,
              BOUNCE_A * Math.exp(-BOUNCE_D * bt) * Math.abs(Math.sin(BOUNCE_W * bt))
            )
            dice.scale.setScalar(1 + height)

            if (rs.elapsed >= BOUNCE_DUR) {
              dice.scale.setScalar(1)
              rs.phase = 'settle'; rs.elapsed = 0
            }
            break
          }

          case 'settle': {
            // Continue decelerating
            dice.rotation.x += rs.vx * dt
            dice.rotation.y += rs.vy * dt
            dice.rotation.z += rs.vz * dt
            const fr = Math.exp(-4.5 * dt)
            rs.vx *= fr; rs.vy *= fr; rs.vz *= fr

            if (Math.abs(rs.vx) + Math.abs(rs.vy) + Math.abs(rs.vz) < STOP_SPEED) {
              // Detect which face is already nearest to pointing up
              const { faceIdx, number } = detectTopFace(dice, geo, faceNumbers)
              rs.roll = number
              // Correction in world space — axis = worldNormal × +Y = (-wz, 0, wx),
              // always horizontal, so snap never spins the die around Y
              const localNormal = faceNormalOf(geo, faceIdx)
              const worldNormal = localNormal.clone().applyQuaternion(dice.quaternion)
              const correction = new THREE.Quaternion().setFromUnitVectors(
                worldNormal, new THREE.Vector3(0, 1, 0)
              )
              rs.targetQuat = new THREE.Quaternion().multiplyQuaternions(correction, dice.quaternion)
              rs.snapFrom.copy(dice.quaternion)
              rs.phase = 'snap'; rs.elapsed = 0
            }
            break
          }

          case 'snap': {
            // Damped spring in slerp space: overshoots target angle, rocks back, settles
            // spring > 1 extrapolates past targetQuat; <1 returns; converges to 1
            const spring = 1 - Math.exp(-6 * rs.elapsed) * Math.cos(9 * rs.elapsed)
            dice.quaternion.slerpQuaternions(rs.snapFrom, rs.targetQuat, spring)

            if (rs.elapsed >= SNAP_DUR) {
              dice.quaternion.copy(rs.targetQuat)
              rs.phase = 'done'
              onDoneRef.current?.(rs.roll)
            }
            break
          }

          case 'idle':
            // Gentle spin before first roll
            dice.rotation.y += 0.30 * dt
            dice.rotation.x += 0.06 * dt
            break

          // 'done': stationary, top face toward camera
        }

        renderer.render(scene, camera)
      }
      s.rafId = requestAnimationFrame(frame)

      s.dispose = () => {
        renderer.dispose()
        geo.dispose(); baseGeo.dispose(); edgeGeo.dispose(); edgeMat.dispose()
        bgTex.dispose(); bgMat.dispose(); bgPlane.geometry.dispose()
        textures.forEach(t => t.dispose())
        materials.forEach(m => m.dispose())
        if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
      }
    })

    return () => {
      mounted = false
      cancelAnimationFrame(s.rafId)
      triggerRef.current = null
      s.dispose?.()
    }
  }, [])

  useEffect(() => {
    if (rolling) triggerRef.current?.()
  }, [rolling])

  return <div ref={mountRef} style={{ width: 220, height: 220, margin: '0 auto' }} />
}
