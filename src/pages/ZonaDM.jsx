import { useState, useRef, useEffect } from 'react'
import { useApp } from '../AppContext'
import { firestore } from '../firebase'
import { writeBatch, doc, deleteDoc } from 'firebase/firestore'
import { SlidersHorizontal, Trash2 } from 'lucide-react'

const COIN_TYPES = ['cp', 'sp', 'ep', 'gp', 'pp']
const COIN_LABELS = { cp: 'bronce', sp: 'plata', ep: 'electrum', gp: 'oro', pp: 'platino' }

const BACKFILL_COLLECTIONS = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items']

async function backfillTimestamps(db, showToast) {
  const now = new Date().toISOString()
  const batch = writeBatch(firestore)
  let count = 0
  for (const coll of BACKFILL_COLLECTIONS) {
    for (const entity of db[coll] || []) {
      if (!entity.createdAt || !entity.updatedAt) {
        batch.set(
          doc(firestore, coll, String(entity.id)),
          { ...entity, createdAt: entity.createdAt ?? now, updatedAt: entity.updatedAt ?? now }
        )
        count++
      }
    }
  }
  if (count > 0) await batch.commit()
  showToast(count > 0 ? `${count} artículos actualizados con timestamps.` : 'Todos los artículos ya tienen timestamps.')
}

function formatTimestamp(iso) {
  const d = new Date(iso)
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function ZonaDM() {
  const { db, showToast, isDM, exportData, importData } = useApp()
  const loginLogs = [...(db.login_logs || [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  const [backfilling, setBackfilling] = useState(false)
  const fileInputRef = useRef(null)

  if (!isDM) return null

  function handleImportFile(e) {
    const file = e.target.files[0]
    if (file) importData(file)
    e.target.value = ''
  }

  return (
    <div>
      <div className="mb-7 pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
          Dungeon Master
        </div>
        <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase flex items-center gap-3">
          <SlidersHorizontal size={22} className="text-accent" />
          Zona DM
        </div>
      </div>

      <Section title="Datos">
        <Action
          label="Exportar JSON"
          description="Descarga todos los datos de la wiki como archivo JSON."
          buttonLabel="Exportar"
          onClick={exportData}
        />
        <Action
          label="Importar JSON"
          description="Reemplaza todos los datos actuales con los de un archivo JSON. No se puede deshacer."
          buttonLabel="Importar"
          onClick={() => fileInputRef.current.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportFile}
        />
      </Section>

      <Section title="Registro de accesos">
        {loginLogs.length === 0 ? (
          <div className="text-[13px] text-txt-muted italic px-1">Sin registros aún.</div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-[400px] overflow-y-auto pr-1">
            {loginLogs.map(log => (
              <div key={log.id} className="bg-bg-card border border-border-base px-4 py-2.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-exo text-[12px] font-semibold text-txt-primary tracking-[0.03em] truncate">
                    {log.playerName}
                  </span>
                  <span className="text-[11px] text-txt-muted flex-shrink-0">
                    {formatTimestamp(log.timestamp)}
                  </span>
                </div>
                <button
                  className="flex-shrink-0 text-txt-muted hover:text-accent transition-colors p-1"
                  title="Eliminar entrada"
                  onClick={() => deleteDoc(doc(firestore, 'login_logs', log.id))}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <JuegosSection />

      <Section title="Mantenimiento">
        <Action
          label="Actualizar timestamps"
          description="Agrega createdAt y updatedAt a los artículos que no los tengan."
          buttonLabel={backfilling ? 'Actualizando…' : 'Ejecutar'}
          disabled={backfilling}
          onClick={async () => {
            setBackfilling(true)
            try { await backfillTimestamps(db, showToast) }
            catch (e) { console.error(e); showToast('Error en backfill. Ver consola.') }
            finally { setBackfilling(false) }
          }}
        />
      </Section>
    </div>
  )
}

function JuegosSection() {
  const { db, showToast, saveGameConfig, assignPotToPJ } = useApp()

  const config = (db.game_config || []).find(c => c.id === 'loteria') ?? {
    commonMinRoll: 16,
    commonPrize: { cp: 3, sp: 0, ep: 0, gp: 0, pp: 0 },
    specialPrize: { cp: 0, sp: 1, ep: 0, gp: 0, pp: 0 },
  }
  const pot = (db.game_pot || []).find(p => p.id === 'current') ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
  const pjs = (db.pjs || [])
  const gameLogs = [...(db.game_logs || [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  const [cfgForm, setCfgForm] = useState({
    commonMinRoll: config.commonMinRoll,
    commonPrize: { ...config.commonPrize },
    specialPrize: { ...config.specialPrize },
  })

  const [assignForm, setAssignForm] = useState({ pjId: '', cp: pot.cp, sp: pot.sp, ep: pot.ep, gp: pot.gp, pp: pot.pp })
  const [saving, setSaving] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const freshConfig = (db.game_config || []).find(c => c.id === 'loteria')
    if (!freshConfig) return
    setCfgForm({
      commonMinRoll: freshConfig.commonMinRoll,
      commonPrize: { ...freshConfig.commonPrize },
      specialPrize: { ...freshConfig.specialPrize },
    })
  }, [db.game_config])

  const fieldCls = 'bg-bg-mid border border-border-base text-txt-primary font-barlow text-sm px-3 py-1.5 outline-none transition-colors focus:border-accent-dim'
  const labelCls = 'font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5 block'
  const btnCls = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-muted border border-border-light hover:border-accent-dim hover:text-txt-primary disabled:opacity-40 disabled:cursor-not-allowed'

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === gameLogs.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(gameLogs.map(l => l.id)))
    }
  }

  async function deleteSelected() {
    setDeleting(true)
    try {
      const batch = writeBatch(firestore)
      selectedIds.forEach(id => batch.delete(doc(firestore, 'game_logs', id)))
      await batch.commit()
      setSelectedIds(new Set())
    } catch (e) {
      showToast('Error al eliminar tiradas')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSaveConfig() {
    setSaving(true)
    try { await saveGameConfig(cfgForm) }
    catch (e) { showToast(e.message || 'Error al guardar configuración') }
    finally { setSaving(false) }
  }

  async function handleTransfer() {
    if (!assignForm.pjId) { showToast('Seleccioná un PJ'); return }
    const total = COIN_TYPES.reduce((s, c) => s + (Number(assignForm[c]) || 0), 0)
    if (total === 0) { showToast('Ingresá una cantidad'); return }
    setTransferring(true)
    try {
      const amount = Object.fromEntries(COIN_TYPES.map(c => [c, Number(assignForm[c]) || 0]))
      await assignPotToPJ(Number(assignForm.pjId), amount)
      setAssignForm(f => ({ ...f, cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }))
    } catch (e) {
      showToast(e.message || 'Error al transferir')
    } finally {
      setTransferring(false)
    }
  }

  function actorLabel(log) {
    if (log.actorType === 'dm') return 'DM'
    const pj = pjs.find(p => p.id === log.playerId)
    return pj ? pj.nombre : `PJ #${log.playerId}`
  }

  function prizeLabel(prize) {
    const parts = COIN_TYPES.filter(c => (prize?.[c] || 0) > 0).map(c => `${prize[c]} ${c}`)
    return parts.length > 0 ? parts.join(', ') : '—'
  }

  return (
    <>
      <Section title="Juegos — Configuración de lotería">
        <div className="bg-bg-card border border-border-base px-5 py-4 flex flex-col gap-4">
          <div>
            <label className={labelCls}>Tirada mínima para premio común</label>
            <input
              type="number" min={1} max={19}
              value={cfgForm.commonMinRoll}
              onChange={e => setCfgForm(f => ({ ...f, commonMinRoll: Number(e.target.value) }))}
              className={fieldCls + ' w-20'}
            />
          </div>
          <div>
            <label className={labelCls}>Premio común — cp / sp / ep / gp / pp</label>
            <div className="flex gap-2 flex-wrap">
              {COIN_TYPES.map(c => (
                <input key={c} type="number" min={0}
                  value={cfgForm.commonPrize[c] || 0}
                  onChange={e => setCfgForm(f => ({ ...f, commonPrize: { ...f.commonPrize, [c]: Number(e.target.value) } }))}
                  className={fieldCls + ' w-16'}
                  title={COIN_LABELS[c]}
                />
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Premio especial (20 nat) — cp / sp / ep / gp / pp</label>
            <div className="flex gap-2 flex-wrap">
              {COIN_TYPES.map(c => (
                <input key={c} type="number" min={0}
                  value={cfgForm.specialPrize[c] || 0}
                  onChange={e => setCfgForm(f => ({ ...f, specialPrize: { ...f.specialPrize, [c]: Number(e.target.value) } }))}
                  className={fieldCls + ' w-16'}
                  title={COIN_LABELS[c]}
                />
              ))}
            </div>
          </div>
          <div>
            <button className={btnCls} onClick={handleSaveConfig} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </div>
        </div>
      </Section>

      <Section title="Juegos — Pozo acumulado">
        <div className="bg-bg-card border border-border-base px-5 py-4">
          <div className="flex gap-5 flex-wrap mb-4">
            {COIN_TYPES.map(c => (
              <span key={c} className="font-exo text-[13px] text-txt-secondary">
                <span className="text-accent-bright font-semibold">{pot[c] || 0}</span>{' '}{c}
              </span>
            ))}
          </div>
          <div className="mb-3">
            <label className={labelCls}>Transferir al PJ</label>
            <div className="flex flex-wrap gap-2">
              <select
                value={assignForm.pjId}
                onChange={e => setAssignForm(f => ({ ...f, pjId: e.target.value }))}
                className={fieldCls + ' min-w-[140px]'}
              >
                <option value="">— Seleccionar PJ —</option>
                {pjs.map(pj => (
                  <option key={pj.id} value={pj.id}>{pj.nombre}</option>
                ))}
              </select>
              {COIN_TYPES.map(c => (
                <input key={c} type="number" min={0}
                  value={assignForm[c] || 0}
                  onChange={e => setAssignForm(f => ({ ...f, [c]: Number(e.target.value) }))}
                  className={fieldCls + ' w-16'}
                  title={COIN_LABELS[c]}
                />
              ))}
            </div>
          </div>
          <button className={btnCls} onClick={handleTransfer} disabled={transferring}>
            {transferring ? 'Transfiriendo…' : 'Transferir al PJ'}
          </button>
        </div>
      </Section>

      <Section title="Juegos — Registro de tiradas">
        {gameLogs.length === 0 ? (
          <div className="text-[13px] text-txt-muted italic px-1">Sin tiradas aún.</div>
        ) : (
          <>
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-txt-muted">
                  {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
                </span>
                <button className={btnCls} onClick={deleteSelected} disabled={deleting}>
                  <Trash2 size={13} />
                  {deleting ? 'Eliminando…' : `Eliminar ${selectedIds.size}`}
                </button>
              </div>
            )}
            <div className="overflow-x-auto">
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-[12px] text-txt-secondary border-collapse">
                  <thead className="sticky top-0 bg-bg-base z-10">
                    <tr className="border-b border-border-base font-exo text-[10px] tracking-[0.15em] uppercase text-txt-muted">
                      <th className="py-2 pr-3 pl-1">
                        <input
                          type="checkbox"
                          checked={gameLogs.length > 0 && selectedIds.size === gameLogs.length}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="text-left py-2 pr-4 font-semibold">Actor</th>
                      <th className="text-left py-2 pr-4 font-semibold">Tirada</th>
                      <th className="text-left py-2 pr-4 font-semibold">Premio</th>
                      <th className="text-left py-2 pr-4 font-semibold">Destino</th>
                      <th className="text-left py-2 font-semibold">Fecha/Hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gameLogs.map(log => (
                      <tr
                        key={log.id}
                        className={`border-b border-border-base/50 cursor-pointer transition-colors ${selectedIds.has(log.id) ? 'bg-accent/5' : 'hover:bg-bg-mid/40'}`}
                        onClick={() => toggleSelect(log.id)}
                      >
                        <td className="py-2 pr-3 pl-1" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(log.id)}
                            onChange={() => toggleSelect(log.id)}
                          />
                        </td>
                        <td className="py-2 pr-4 font-semibold text-txt-primary">{actorLabel(log)}</td>
                        <td className="py-2 pr-4">{log.roll}</td>
                        <td className="py-2 pr-4 text-accent-bright">{prizeLabel(log.prize)}</td>
                        <td className="py-2 pr-4">{log.prizeTarget === 'pot' ? 'Pozo' : 'Jugador'}</td>
                        <td className="py-2">{formatTimestamp(log.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </Section>
    </>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <div className="font-exo text-[9px] tracking-[0.3em] text-txt-muted uppercase font-semibold mb-3 pb-2 border-b border-border-base">
        {title}
      </div>
      <div className="flex flex-col gap-2">
        {children}
      </div>
    </div>
  )
}

function Action({ label, description, buttonLabel, disabled, onClick }) {
  return (
    <div className="bg-bg-card border border-border-base px-5 py-4 flex items-center justify-between gap-6">
      <div>
        <div className="font-exo text-[12px] font-semibold text-txt-primary tracking-[0.04em] uppercase mb-0.5">
          {label}
        </div>
        {description && (
          <div className="text-[12px] text-txt-secondary">{description}</div>
        )}
      </div>
      <button
        className="flex-shrink-0 inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-muted border border-border-light hover:border-accent-dim hover:text-txt-primary disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={disabled}
        onClick={onClick}
      >
        {buttonLabel}
      </button>
    </div>
  )
}
