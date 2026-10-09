import * as THREE from 'three'

/** Canvas texture of one die face: dark red, radial highlight and the number in the middle. */
export function makeFaceTexture(num) {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#6b1515'
    ctx.fillRect(0, 0, size, size)

    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.35)
    grad.addColorStop(0, 'rgba(255,255,255,0.10)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)

    const fontSize = Math.round(size * 0.24)
    ctx.font = `bold ${fontSize}px "Exo 2", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(0,0,0,0.80)'
    ctx.lineWidth = Math.round(fontSize * 0.18)
    ctx.strokeText(String(num), size / 2, size / 2)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(String(num), size / 2, size / 2)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
