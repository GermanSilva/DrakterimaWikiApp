import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dices } from 'lucide-react'
import { PageHeader } from '../../components/Shared'
import { btnPrimary, sectionTitleCls } from '../../constants'
import { DataError, type Coins, type GameLog } from '../../data'
import { useCampaign } from '../CampaignContext'
import { useCampaignServices } from '../entities/campaignServicesContext'
import { useEntities } from '../entities/useEntities'
import { useGamePot } from '../entities/useGamePot'
import { useLoad } from '../entities/useLoad'
import { formatCoins, hasCoins, normalizeCoins, parseLoteriaConfig, type LoteriaConfig } from '../games/coins'
import { describeDailyReset, utcDay } from '../games/dayReset'
import { describeGameError } from '../games/gameErrors'
import { prefersReducedMotion } from '../games/motion'
import { Loading } from './DetailNotice'

type OverlayComponent = typeof import('../../components/dice/D20Overlay').default
/** Loaded on the first play so three.js stays out of every other chunk. */
const loadOverlay = () => import('../../components/dice/D20Overlay').then((m) => m.default)

const RECENT_LOGS = 5
const CARD = 'bg-bg-card border border-border-base px-6 py-6'
const LABEL = 'font-exo text-[10px] uppercase tracking-[0.1em] text-txt-muted'

interface Outcome {
  roll: number
  prize: Coins
  target: 'player' | 'pot'
}

/** Re-renders every minute so the "time until reset" and the UTC day rollover stay current. */
function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

function PrizeList({ config }: { config: LoteriaConfig }) {
  return (
    <div className="mb-5 flex flex-col gap-1.5 text-[13px] text-txt-secondary">
      <div>
        <span className={LABEL}>Premio común</span> (≥{config.commonMinRoll}):{' '}
        <span className="text-accent-bright font-semibold">{formatCoins(config.commonPrize)}</span>
      </div>
      <div>
        <span className={LABEL}>Premio especial</span> (20 natural):{' '}
        <span className="text-accent-bright font-semibold">{formatCoins(config.specialPrize)}</span>
      </div>
    </div>
  )
}

function RecentLogs({ logs, nameOf }: { logs: GameLog[]; nameOf: (id: number | null) => string | null }) {
  if (logs.length === 0) return null
  return (
    <section className="mt-6" aria-label="Últimas tiradas">
      <div className={sectionTitleCls}>Últimas tiradas</div>
      <ul className="text-[13px] text-txt-secondary divide-y divide-border-base border border-border-base bg-bg-card">
        {logs.map((l) => (
          <li key={l.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2">
            <span className="text-txt-muted tabular-nums">{l.play_date}</span>
            {nameOf(l.character_id) && <span>{nameOf(l.character_id)}</span>}
            <span className="font-exo font-semibold text-txt-primary">Salió {l.roll}</span>
            <span className={hasCoins(l.prize) ? 'text-accent-bright' : 'text-txt-muted'}>{formatCoins(l.prize, 'sin premio')}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** `/c/:slug/juegos`: the daily d20 lottery. The roll is decided by the server; the dice only animates to it. */
export function JuegosPage() {
  const { isDM, myCharacterIds } = useCampaign()
  const { layer, campaignId } = useCampaignServices()
  const now = useNow()
  const today = utcDay(now)

  const configState = useLoad(() => layer.config.get(campaignId, 'loteria'), `loteria-config:${campaignId}`)
  const logsState = useLoad(() => layer.games.listLogs(campaignId), `game-logs:${campaignId}`)
  const { pot, loading: potLoading, error: potError } = useGamePot()
  const pjs = useEntities('pjs', { enabled: myCharacterIds.length > 0 })

  const config = useMemo(() => parseLoteriaConfig(configState.data?.value), [configState.data])
  const pjName = useCallback((id: number | null) => (id === null ? null : (pjs.items.find((p) => p.id === id)?.nombre as string | undefined) ?? `Personaje #${id}`), [pjs.items])

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const characterId = isDM ? null : selectedId !== null && myCharacterIds.includes(selectedId) ? selectedId : (myCharacterIds[0] ?? null)

  const [playedKeys, setPlayedKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'rolling'>('idle')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [Overlay, setOverlay] = useState<OverlayComponent | null>(null)

  const busy = useRef(false) // synchronous double-click guard (state would lag a frame)
  const finished = useRef(true)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const logs = useMemo(() => logsState.data ?? [], [logsState.data])
  const playedToday =
    !isDM &&
    characterId !== null &&
    (playedKeys.has(`${today}:${characterId}`) ||
      logs.some((l) => l.game === 'loteria' && l.actor_type === 'player' && l.character_id === characterId && l.play_date === today))
  const todayLog = !isDM && characterId !== null ? logs.find((l) => l.game === 'loteria' && l.actor_type === 'player' && l.character_id === characterId && l.play_date === today) : undefined
  const recent = useMemo(
    () => logs.filter((l) => (isDM ? l.actor_type === 'dm' : l.character_id !== null && myCharacterIds.includes(l.character_id))).slice(0, RECENT_LOGS),
    [logs, isDM, myCharacterIds],
  )

  const refreshLogs = logsState.refresh
  /** Ends a play: shows the result, frees the button and re-reads the logs. Safe to call more than once. */
  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    busy.current = false
    if (!mounted.current) return
    setRevealed(true)
    setPhase('idle')
    refreshLogs()
  }, [refreshLogs])

  const canPlay = isDM || characterId !== null
  async function play() {
    if (busy.current || !canPlay || playedToday) return
    busy.current = true
    finished.current = false
    setError(null)
    setOutcome(null)
    setRevealed(false)
    setOverlay(null)
    setPhase('requesting')
    const wantsAnimation = !prefersReducedMotion()
    // the chunk downloads while the server decides; a failed download just skips the animation
    const overlayModule = wantsAnimation ? loadOverlay().catch(() => null) : Promise.resolve(null)
    try {
      const result = await layer.games.playLoteria(campaignId, characterId ?? undefined)
      if (!mounted.current) return
      if (characterId !== null) setPlayedKeys((prev) => new Set(prev).add(`${today}:${characterId}`))
      setOutcome({ roll: result.roll, prize: normalizeCoins(result.prize), target: result.prize_target })
      const Dice = await overlayModule
      if (!mounted.current) return
      if (!Dice) {
        finish()
        return
      }
      setOverlay(() => Dice)
      setPhase('rolling')
    } catch (e) {
      busy.current = false
      finished.current = true
      if (!mounted.current) return
      setPhase('idle')
      setError(describeGameError(e))
      if (e instanceof DataError && e.reason === 'already_played_today' && characterId !== null) {
        setPlayedKeys((prev) => new Set(prev).add(`${today}:${characterId}`))
        refreshLogs()
      }
    }
  }

  const header = (
    <PageHeader eyebrow="Homebrew" title="Juegos" titleAs="h1">
      {null}
    </PageHeader>
  )

  const shown = revealed && outcome ? outcome : null
  const won = shown ? hasCoins(shown.prize) : false

  return (
    <div>
      {header}

      <div className="mb-5 bg-bg-card border border-border-base px-5 py-4">
        <div className="font-exo text-[9px] tracking-[0.3em] text-txt-muted uppercase font-semibold mb-2">Pozo acumulado</div>
        {potError ? (
          <p className="text-[13px] text-txt-muted">No pudimos cargar el pozo.</p>
        ) : potLoading ? (
          <p className="text-[13px] text-txt-muted">Cargando…</p>
        ) : (
          <p aria-label="Pozo acumulado" className="font-exo text-[14px] text-accent-bright font-semibold tracking-[0.04em]">
            {formatCoins(pot, 'Vacío')}
          </p>
        )}
      </div>

      <div className={CARD}>
        <div className={sectionTitleCls + ' mb-4'}>La Lotería del Dado</div>

        {configState.status === 'loading' ? (
          <Loading />
        ) : (
          <>
            {configState.status === 'error' && (
              <p role="alert" className="mb-3 text-[12px] text-txt-muted italic">
                No pudimos cargar la configuración: se muestran los premios por defecto.
              </p>
            )}
            <PrizeList config={config} />
          </>
        )}

        {!isDM && myCharacterIds.length === 0 && (
          <p className="text-center text-[13px] text-txt-muted italic mt-2">
            Necesitás un personaje en esta campaña para jugar. Pedile al DM que te asigne uno.
          </p>
        )}

        {!isDM && myCharacterIds.length > 1 && (
          <div className="flex justify-center items-center gap-2 mb-3">
            <label htmlFor="loteria-character" className={LABEL}>
              Personaje
            </label>
            <select
              id="loteria-character"
              className="bg-bg-mid border border-border-base text-txt-primary text-[13px] px-2 py-1"
              value={characterId ?? ''}
              disabled={phase !== 'idle'}
              onChange={(e) => {
                setSelectedId(Number(e.target.value))
                setError(null)
                setOutcome(null)
                setRevealed(false)
              }}
            >
              {myCharacterIds.map((id) => (
                <option key={id} value={id}>
                  {pjName(id)}
                </option>
              ))}
            </select>
          </div>
        )}
        {!isDM && myCharacterIds.length === 1 && characterId !== null && (
          <p className="text-center text-[12px] text-txt-muted mb-3">
            Jugás con <span className="text-txt-secondary">{pjName(characterId)}</span>
          </p>
        )}
        {isDM && <p className="text-center text-[12px] text-txt-muted mb-3">Como DM, el premio va al pozo.</p>}

        {canPlay && (!playedToday || phase !== 'idle') && (
          <div className="flex justify-center mt-2">
            <button type="button" className={btnPrimary} onClick={play} disabled={phase !== 'idle'}>
              <Dices size={14} aria-hidden="true" />
              {phase === 'idle' ? 'Tirar el dado' : 'Tirando…'}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-center text-[13px] text-red-400">
            {error}
          </p>
        )}

        <div role="status" aria-live="polite" aria-label="Resultado" className="mt-4 text-center">
          {shown && (
            <>
              <div className={['font-exo text-5xl font-bold tracking-tight', won ? 'text-accent-bright' : 'text-txt-secondary'].join(' ')}>
                {shown.roll}
              </div>
              {won ? (
                <>
                  <div className="font-exo text-[15px] font-semibold tracking-[0.1em] uppercase text-accent-bright mt-2">¡Ganaste!</div>
                  <div className="text-[13px] mt-1 text-accent-bright">
                    {shown.target === 'pot' ? `${formatCoins(shown.prize)} enviados al pozo.` : `${formatCoins(shown.prize)} añadidos a tu bolsa.`}
                  </div>
                </>
              ) : (
                <div className="font-exo text-[13px] tracking-[0.05em] text-txt-muted mt-2">Sin premio esta vez.</div>
              )}
            </>
          )}
          {!shown && todayLog && phase === 'idle' && (
            <div className="text-[13px] text-txt-secondary">
              Tu tirada de hoy: <span className="font-exo font-semibold text-txt-primary">{todayLog.roll}</span> · {formatCoins(todayLog.prize, 'sin premio')}
            </div>
          )}
        </div>

        {playedToday && phase === 'idle' && (
          <p className="mt-4 text-center text-[12px] text-txt-muted italic">Ya jugaste hoy. {describeDailyReset(now)}</p>
        )}
      </div>

      <RecentLogs logs={recent} nameOf={isDM ? () => null : pjName} />

      {Overlay && outcome && <Overlay roll={outcome.roll} onComplete={finish} onClose={() => { finish(); setOverlay(null) }} />}
    </div>
  )
}
