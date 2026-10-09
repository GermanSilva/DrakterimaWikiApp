/**
 * Pure geometry and motion of the thrown d20 (no three.js, unit-testable).
 *
 * The die is an icosahedron whose 20 faces carry the numbers 1..20 (opposite faces sum to 21). The
 * server decides the roll; `rollPose` animates a tumbling die that comes to rest EXACTLY with the face
 * of that roll pointing at the top-down camera (+Y) and its number upright on screen (screen-up = -Z,
 * screen-right = +X, see the camera set-up in D20Overlay).
 */

export type Vec3 = readonly [number, number, number]
/** Unit quaternion as [x, y, z, w]. */
export type Quat = readonly [number, number, number, number]

export const FACE_COUNT = 20

const T = (1 + Math.sqrt(5)) / 2

/** The 12 vertices of the icosahedron (not normalised: all have the same length, sqrt(1 + T^2)). */
export const VERTICES: readonly Vec3[] = [
  [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0],
  [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T],
  [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
]

/** Vertex indices of each face, counter-clockwise seen from outside. */
export const FACES: readonly (readonly [number, number, number])[] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
]

// --- vector / quaternion helpers -----------------------------------------------------------------

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const normalize = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]))

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const [x, y, z] = normalize(axis)
  const s = Math.sin(angle / 2)
  return [x * s, y * s, z * s, Math.cos(angle / 2)]
}

/** Rotates `v` by the unit quaternion `q`. */
export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const qv: Vec3 = [q[0], q[1], q[2]]
  const t = scale(cross(qv, v), 2)
  return add(add(v, scale(t, q[3])), cross(qv, t))
}

/** Rotation given by its row-major matrix (Shepperd's method). */
function quatFromMatrix(m: readonly (readonly number[])[]): Quat {
  const trace = m[0][0] + m[1][1] + m[2][2]
  let q: Quat
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2
    q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4]
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2
    q = [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s]
  } else if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2
    q = [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s]
  } else {
    const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2
    q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s]
  }
  const len = Math.hypot(q[0], q[1], q[2], q[3])
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len]
}

// --- faces ---------------------------------------------------------------------------------------

function centroid(face: number): Vec3 {
  const [a, b, c] = FACES[face].map((i) => VERTICES[i])
  return scale(add(add(a, b), c), 1 / 3)
}

/** Outward unit normal of a face, in the die's local space. */
export function faceNormal(face: number): Vec3 {
  const [a, b, c] = FACES[face].map((i) => VERTICES[i])
  return normalize(cross(sub(b, a), sub(c, a)))
}

/**
 * Unit vector from the face centre towards its first vertex: the direction the printed number's top
 * points to (the first vertex is the top corner of the face texture).
 */
export function faceUp(face: number): Vec3 {
  return normalize(sub(VERTICES[FACES[face][0]], centroid(face)))
}

/** Number printed on each face. Opposite faces sum to 21, every number 1..20 appears once. */
export const FACE_NUMBERS: readonly number[] = (() => {
  const nums = new Array<number>(FACE_COUNT).fill(0)
  let next = 1
  for (let i = 0; i < FACE_COUNT; i++) {
    if (nums[i] !== 0) continue
    const opposite = FACES.findIndex((_, j) => j !== i && dot(faceNormal(i), faceNormal(j)) < -0.99)
    nums[i] = next
    nums[opposite] = 21 - next
    next++
  }
  return nums
})()

/** Index of the face that shows `roll` (1..20). */
export function faceIndexForRoll(roll: number): number {
  if (!Number.isInteger(roll) || roll < 1 || roll > FACE_COUNT) throw new RangeError(`d20 roll out of range: ${roll}`)
  return FACE_NUMBERS.indexOf(roll)
}

const WORLD_UP: Vec3 = [0, 1, 0] // toward the camera
const SCREEN_UP: Vec3 = [0, 0, -1]
const SCREEN_LEFT: Vec3 = [-1, 0, 0] // WORLD_UP x SCREEN_UP

/** Orientation at rest: the face of `roll` looks at the camera with its number upright on screen. */
export function restingQuaternion(roll: number): Quat {
  const face = faceIndexForRoll(roll)
  const n = faceNormal(face)
  const u = faceUp(face)
  const w = cross(n, u)
  const local = [n, u, w]
  const target = [WORLD_UP, SCREEN_UP, SCREEN_LEFT]
  // R = sum over i of target_i * local_i^T
  const m = [0, 1, 2].map((r) => [0, 1, 2].map((c) => local.reduce((acc, l, i) => acc + target[i][r] * l[c], 0)))
  return quatFromMatrix(m)
}

// --- the throw -----------------------------------------------------------------------------------

export const THROW_SEC = 0.55 // slides in from off-screen
export const SPIN_SEC = 1.6 // tumbling slows down until it stops
export const WOBBLE_SEC = 0.7 // rocking back and forth onto the face
export const ROLL_TOTAL_SEC = SPIN_SEC + WOBBLE_SEC

const BOUNCE_SEC = 0.9
const BOUNCE_AMPLITUDE = 0.5 // peak zoom: scale 1 + amplitude
const BOUNCE_OMEGA = 12
const BOUNCE_DECAY = 3.8
const WOBBLE_AMPLITUDE = 0.22 // rad
const WOBBLE_OMEGA = 14
const WOBBLE_DECAY = 6

export interface RollParams {
  /** The server's roll, 1..20. */
  roll: number
  /** Where the die enters from (off-screen). */
  from: Vec3
  spinAxis: Vec3
  /** Full turns of tumbling before it settles. */
  turns: number
  /** Direction (rad around Y) of the final rocking. */
  rockAngle: number
}

export interface Pose {
  position: Vec3
  quaternion: Quat
  scale: number
  done: boolean
}

/** Randomised throw for `roll` entering from `from`. `rng` returns [0, 1). */
export function createRollParams(roll: number, from: Vec3, rng: () => number = Math.random): RollParams {
  const spinAxis = normalize([rng() - 0.5 || 0.1, rng() - 0.5 || 0.1, rng() - 0.5 || 0.1])
  return { roll, from, spinAxis, turns: 3 + rng() * 2, rockAngle: rng() * Math.PI * 2 }
}

/** The pose of the die `t` seconds after the throw; from `ROLL_TOTAL_SEC` on it is exactly at rest on the roll. */
export function rollPose(t: number, params: RollParams): Pose {
  const rest = restingQuaternion(params.roll)
  if (t >= ROLL_TOTAL_SEC) return { position: [0, 0, 0], quaternion: rest, scale: 1, done: true }
  const time = Math.max(0, t)

  const p = Math.min(time / THROW_SEC, 1)
  const ease = 1 - (1 - p) * (1 - p)
  const position: Vec3 = [params.from[0] * (1 - ease), params.from[1] * (1 - ease), params.from[2] * (1 - p * p)]

  // residual tumbling decays to zero with zero speed, then a damped rocking settles onto the face
  const q = Math.min(time / SPIN_SEC, 1)
  const residual = params.turns * 2 * Math.PI * (1 - q) * (1 - q)
  let quaternion = quatMultiply(quatFromAxisAngle(params.spinAxis, residual), rest)
  if (time > SPIN_SEC) {
    const tau = time - SPIN_SEC
    const fade = 1 - tau / WOBBLE_SEC
    const angle = WOBBLE_AMPLITUDE * Math.exp(-WOBBLE_DECAY * tau) * Math.sin(WOBBLE_OMEGA * tau) * fade * fade
    const axis: Vec3 = [Math.cos(params.rockAngle), 0, Math.sin(params.rockAngle)]
    quaternion = quatMultiply(quatFromAxisAngle(axis, angle), quaternion)
  }

  // zoom bounce after it lands (a die bouncing up looks closer)
  const bt = time - THROW_SEC
  const zoom =
    bt > 0 && bt < BOUNCE_SEC ? BOUNCE_AMPLITUDE * Math.exp(-BOUNCE_DECAY * bt) * Math.abs(Math.sin(BOUNCE_OMEGA * bt)) : 0

  return { position, quaternion, scale: 1 + zoom, done: false }
}
