import { useState, lazy, Suspense } from 'react'
import { useApp } from '../AppContext'
import { Dice5 } from 'lucide-react'
import { sectionTitleCls, btnPrimary } from '../constants'

const Dice3D = lazy(() => import('../components/Dice3D'))

const COIN_TYPES = ['cp', 'sp', 'ep', 'gp', 'pp']
const COIN_LABELS = { cp: 'bronce', sp: 'plata', ep: 'electrum', gp: 'oro', pp: 'platino' }
const DEFAULT_CONFIG = {
  commonMinRoll: 17,
  commonPrize: { cp: 3, sp: 0, ep: 0, gp: 0, pp: 0 },
  specialPrize: { cp: 0, sp: 1, ep: 0, gp: 0, pp: 0 },
}

function formatPrize(prize) {
  const parts = COIN_TYPES.filter(c => (prize[c] || 0) > 0).map(c => `${prize[c]} ${COIN_LABELS[c]}`)
  return parts.length > 0 ? parts.join(', ') : 'nada'
}

function hoursUntilMidnight() {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  const diff = midnight - now
  return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`
}

export default function Juegos() {
  const { db, currentPlayer, isDM, saveGameResult, showToast } = useApp()

  const config = (db.game_config || []).find(c => c.id === 'loteria') ?? DEFAULT_CONFIG
  const pot    = (db.game_pot   || []).find(p => p.id === 'current')  ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
  const potHasValue = COIN_TYPES.some(c => (pot[c] || 0) > 0)

  const today    = new Date().toISOString().slice(0, 10)
  const todayLog = currentPlayer
    ? (db.game_logs || []).find(l => l.id === `${currentPlayer.id}_loteria_${today}`)
    : null

  const [rolling,    setRolling]    = useState(false)
  const [lastResult, setLastResult] = useState(null) // { roll, prize }

  const hasSession         = isDM || !!currentPlayer
  const alreadyPlayedToday = !isDM && !!todayLog

  function calcPrize(roll) {
    if (roll === 20)                  return { ...config.specialPrize }
    if (roll >= config.commonMinRoll) return { ...config.commonPrize }
    return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
  }

  function handleRoll() {
    if (rolling || alreadyPlayedToday) return
    setLastResult(null)
    setRolling(true)
  }

  // roll comes from Dice3D: the face that was facing the camera when it stopped
  function handleDiceComplete(roll) {
    const prize = calcPrize(roll)
    setLastResult({ roll, prize })
    saveGameResult(isDM ? 'dm' : 'player', currentPlayer?.id ?? null, roll)
      .catch(() => showToast('Error al guardar. Intentá de nuevo.'))
      .finally(() => setRolling(false))
  }

  const shownResult  = lastResult ?? (todayLog ? { roll: todayLog.roll, prize: todayLog.prize } : null)
  const wonSomething = shownResult && COIN_TYPES.some(c => (shownResult.prize?.[c] || 0) > 0)

  return (
    <div>
      <div className="mb-7 pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
          Homebrew
        </div>
        <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase flex items-center gap-3">
          <Dice5 size={22} className="text-accent" />
          Juegos
        </div>
      </div>

      {potHasValue && (
        <div className="mb-5 bg-bg-card border border-border-base px-5 py-4">
          <div className="font-exo text-[9px] tracking-[0.3em] text-txt-muted uppercase font-semibold mb-2">
            Pozo acumulado
          </div>
          <div className="flex gap-5 flex-wrap">
            {COIN_TYPES.filter(c => (pot[c] || 0) > 0).map(c => (
              <span key={c} className="font-exo text-[14px] text-accent-bright font-semibold tracking-[0.04em]">
                {pot[c]} {COIN_LABELS[c]}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-bg-card border border-border-base px-6 py-6">
        <div className={sectionTitleCls + ' mb-4'}>La Lotería del Dado</div>

        <div className="mb-5 flex flex-col gap-1.5 text-[13px] text-txt-secondary">
          <div>
            <span className="font-exo text-[10px] uppercase tracking-[0.1em] text-txt-muted">Premio común</span>
            {' '}(≥{config.commonMinRoll}): <span className="text-accent-bright font-semibold">{formatPrize(config.commonPrize)}</span>
          </div>
          <div>
            <span className="font-exo text-[10px] uppercase tracking-[0.1em] text-txt-muted">Premio especial</span>
            {' '}(20 nat): <span className="text-accent-bright font-semibold">{formatPrize(config.specialPrize)}</span>
          </div>
        </div>

        {/* 3D dice */}
        <Suspense fallback={<div style={{ width: 220, height: 220, margin: '0 auto' }} />}>
          <Dice3D rolling={rolling} onAnimationComplete={handleDiceComplete} />
        </Suspense>

        {/* Roll result number */}
        {shownResult && (
          <div className="text-center -mt-2 mb-2">
            <span
              className={[
                'font-exo text-5xl font-bold tracking-tight',
                wonSomething ? 'text-accent-bright' : 'text-txt-secondary',
              ].join(' ')}
            >
              {shownResult.roll}
            </span>
          </div>
        )}

        {!hasSession && (
          <p className="text-center text-[13px] text-txt-muted italic mt-2">
            Iniciá sesión para jugar.
          </p>
        )}

        {hasSession && !alreadyPlayedToday && (
          <div className="flex justify-center mt-4">
            <button className={btnPrimary} onClick={handleRoll} disabled={rolling}>
              {rolling ? 'Tirando…' : 'Tirar el dado'}
            </button>
          </div>
        )}

        {shownResult && (
          <div className={['mt-4 text-center', wonSomething ? 'text-accent-bright' : 'text-txt-muted'].join(' ')}>
            {wonSomething ? (
              <>
                <div className="font-exo text-[15px] font-semibold tracking-[0.1em] uppercase">¡Ganaste!</div>
                <div className="text-[13px] mt-1">
                  {isDM
                    ? `${formatPrize(shownResult.prize)} enviados al pozo.`
                    : `${formatPrize(shownResult.prize)} añadidos a tu bolsa.`}
                </div>
              </>
            ) : (
              <div className="font-exo text-[13px] tracking-[0.05em]">Sin premio esta vez.</div>
            )}
          </div>
        )}

        {!isDM && alreadyPlayedToday && (
          <div className="mt-4 text-center text-[12px] text-txt-muted italic">
            Ya jugaste hoy. Volvé en {hoursUntilMidnight()}.
          </div>
        )}
      </div>
    </div>
  )
}
