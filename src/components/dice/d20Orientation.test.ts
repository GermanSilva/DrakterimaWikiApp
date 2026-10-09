import { describe, expect, it } from 'vitest'
import {
  FACE_COUNT, FACE_NUMBERS, FACES, ROLL_TOTAL_SEC, SPIN_SEC, THROW_SEC, VERTICES, createRollParams, cross, dot, faceIndexForRoll,
  faceNormal, faceUp, quatMultiply, restingQuaternion, rollPose, rotateVec, type Vec3,
} from './d20Orientation'

const close = (a: readonly number[], b: readonly number[], eps = 1e-9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], -Math.log10(eps)))
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
const ROLLS = Array.from({ length: 20 }, (_, i) => i + 1)

describe('d20 geometry', () => {
  it('has 20 outward counter-clockwise faces of equal size', () => {
    expect(FACES).toHaveLength(FACE_COUNT)
    expect(VERTICES).toHaveLength(12)
    for (let i = 0; i < FACE_COUNT; i++) {
      const centre = FACES[i].reduce<Vec3>((acc, v) => [acc[0] + VERTICES[v][0], acc[1] + VERTICES[v][1], acc[2] + VERTICES[v][2]], [0, 0, 0])
      expect(dot(faceNormal(i), centre)).toBeGreaterThan(0)
      expect(Math.hypot(...faceNormal(i))).toBeCloseTo(1, 12)
      expect(dot(faceUp(i), faceNormal(i))).toBeCloseTo(0, 12)
    }
  })

  it('prints 1..20 once, opposite faces summing to 21', () => {
    expect([...FACE_NUMBERS].sort((a, b) => a - b)).toEqual(ROLLS)
    for (let i = 0; i < FACE_COUNT; i++) {
      const opposite = FACES.findIndex((_, j) => dot(faceNormal(i), faceNormal(j)) < -0.99)
      expect(FACE_NUMBERS[i] + FACE_NUMBERS[opposite]).toBe(21)
    }
  })

  it('finds the face of each roll and rejects invalid rolls', () => {
    for (const roll of ROLLS) expect(FACE_NUMBERS[faceIndexForRoll(roll)]).toBe(roll)
    for (const bad of [0, 21, 1.5, NaN, -3]) expect(() => faceIndexForRoll(bad)).toThrow(RangeError)
  })
})

describe('resting orientation', () => {
  it.each(ROLLS)('roll %i: its face looks at the camera with the number upright', (roll) => {
    const q = restingQuaternion(roll)
    const face = faceIndexForRoll(roll)
    close(rotateVec(q, faceNormal(face)), [0, 1, 0]) // towards the top-down camera
    close(rotateVec(q, faceUp(face)), [0, 0, -1]) // screen up
    close(rotateVec(q, cross(faceNormal(face), faceUp(face))), [-1, 0, 0]) // proper rotation (no mirroring)
    expect(Math.hypot(...q)).toBeCloseTo(1, 12)
  })

  it('shows no other face to the camera', () => {
    for (const roll of ROLLS) {
      const q = restingQuaternion(roll)
      const face = faceIndexForRoll(roll)
      for (let i = 0; i < FACE_COUNT; i++) {
        if (i !== face) expect(rotateVec(q, faceNormal(i))[1]).toBeLessThan(0.75)
      }
    }
  })
})

describe('rollPose', () => {
  const from: Vec3 = [8, 0, -6]
  const params = (roll: number, seed = 7) => createRollParams(roll, from, seeded(seed))

  it.each(ROLLS)('roll %i: lands exactly on its face once the throw ends', (roll) => {
    const end = rollPose(ROLL_TOTAL_SEC, params(roll))
    expect(end.done).toBe(true)
    expect(end.position).toEqual([0, 0, 0])
    expect(end.scale).toBe(1)
    close(rotateVec(end.quaternion, faceNormal(faceIndexForRoll(roll))), [0, 1, 0])
    // and long after
    expect(rollPose(ROLL_TOTAL_SEC + 10, params(roll)).quaternion).toEqual(end.quaternion)
  })

  it('lands on the requested face whatever the random throw', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const p = params(13, seed)
      close(rotateVec(rollPose(ROLL_TOTAL_SEC, p).quaternion, faceNormal(faceIndexForRoll(13))), [0, 1, 0])
    }
  })

  it('starts off-screen and arrives at the centre after the slide', () => {
    expect(rollPose(0, params(5)).position).toEqual(from)
    close(rollPose(THROW_SEC, params(5)).position, [0, 0, 0])
    expect(rollPose(-1, params(5)).position).toEqual(from) // clamped
  })

  it('tumbles (is not at rest) mid-throw but is at rest when the spin ends', () => {
    const p = params(9)
    const face = faceIndexForRoll(9)
    const mid = rotateVec(rollPose(0.3, p).quaternion, faceNormal(face))
    expect(mid[1]).toBeLessThan(0.99)
    // at the end of the spin only the (small) rocking is left
    expect(rotateVec(rollPose(SPIN_SEC, p).quaternion, faceNormal(face))[1]).toBeGreaterThan(0.9999)
  })

  it('zooms while bouncing and returns to scale 1', () => {
    const p = params(2)
    const scales = Array.from({ length: 200 }, (_, i) => rollPose((i / 200) * ROLL_TOTAL_SEC, p).scale)
    expect(Math.max(...scales)).toBeGreaterThan(1.05)
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(1)
    expect(rollPose(ROLL_TOTAL_SEC - 0.01, p).scale).toBe(1)
  })

  it('keeps the quaternion normalised throughout', () => {
    const p = params(20)
    for (let t = 0; t <= ROLL_TOTAL_SEC; t += 0.05) expect(Math.hypot(...rollPose(t, p).quaternion)).toBeCloseTo(1, 9)
  })

  it('quatMultiply composes rotations (b first, then a)', () => {
    const rest = restingQuaternion(1)
    const twice = quatMultiply(rest, [0, 0, 0, 1])
    close(twice, rest)
  })
})
