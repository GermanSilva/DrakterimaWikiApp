import { useState, useRef } from 'react'
import { useApp } from '../AppContext'
import { firestore } from '../firebase'
import { writeBatch, doc, deleteDoc } from 'firebase/firestore'
import { SlidersHorizontal, Trash2 } from 'lucide-react'

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
          <div className="flex flex-col gap-1.5">
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
