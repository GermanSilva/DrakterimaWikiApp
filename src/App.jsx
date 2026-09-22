import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { AppContext } from './AppContext'
import { defaultData, seedPJs, seedPNJs, seedSesiones } from './seed'
import { nextId, isVisible, getViewerId } from './helpers'
import { changedPjSections } from './helpers/pjSections'
import { firestore } from './firebase'
import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, getDocs, writeBatch, increment,
} from 'firebase/firestore'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import DetailPanel from './components/DetailPanel'
import FormModal from './components/FormModal'
import Toast from './components/Toast'
import Dashboard from './pages/Dashboard'
import Notas from './pages/Notas'
import ZonaDM from './pages/ZonaDM'
import Sesiones from './pages/Sesiones'
import PJs from './pages/PJs'
import PNJs from './pages/PNJs'
import Lugares from './pages/Lugares'
import Facciones from './pages/Facciones'
import Lore from './pages/Lore'
import Items from './pages/Items'
import Juegos from './pages/Juegos'
import Mapas from './pages/Mapas'
import SRD from './pages/SRD'
import Calendario from './pages/Calendario'
import Homerules from './pages/Homerules'

const SessionScreen = lazy(() => import('./pages/SessionScreen'))

const PLAYER_PASSWORDS = {
  1: import.meta.env.VITE_PLAYER_1_PASSWORD,
  2: import.meta.env.VITE_PLAYER_2_PASSWORD,
  3: import.meta.env.VITE_PLAYER_3_PASSWORD,
  4: import.meta.env.VITE_PLAYER_4_PASSWORD,
  5: import.meta.env.VITE_PLAYER_5_PASSWORD,
  6: import.meta.env.VITE_PLAYER_6_PASSWORD,
}

const COLLECTIONS = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'player_notes', 'login_logs', 'game_logs', 'game_pot', 'game_config', 'mapas', 'map_points', 'homebrew_rules', 'disponibilidad', 'read_state']

const UNREAD_TYPES = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items']

function sectionReadEntry(viewerId, pjId, section, seenAt) {
  const id = `${viewerId}_pjs_${pjId}_${section}`
  return [doc(firestore, 'read_state', id), { id, viewerId, type: 'pjs', entityId: pjId, section, seenAt }]
}

async function seedCollectionIfEmpty(collName, seedData) {
  const snap = await getDocs(collection(firestore, collName))
  if (!snap.empty) return
  const batch = writeBatch(firestore)
  for (const item of seedData) {
    batch.set(doc(firestore, collName, String(item.id)), item)
  }
  await batch.commit()
}

const PAGES = {
  dashboard: Dashboard,
  zonaDM: ZonaDM,
  notas: Notas,
  sesiones: Sesiones,
  pjs: PJs,
  pnjs: PNJs,
  mapas: Mapas,
  lugares: Lugares,
  facciones: Facciones,
  lore: Lore,
  items: Items,
  juegos: Juegos,
  srd: SRD,
  calendario: Calendario,
  sessionScreen: SessionScreen,
  homebrew_rules: Homerules,
}

export default function App() {
  const [db, setDb] = useState(() => JSON.parse(JSON.stringify(defaultData)))
  const [page, setPage] = useState('dashboard')
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(null)
  const [toastMsg, setToastMsg] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('drakterima_sidebar_collapsed') === '1')
  const [pendingDetail, setPendingDetail] = useState(null)
  const [isDM, setIsDM] = useState(() => sessionStorage.getItem('drakterima_dm') === '1')
  const [currentPlayer, setCurrentPlayer] = useState(() => {
    try {
      const raw = sessionStorage.getItem('drakterima_player')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })

  useEffect(() => {
    async function maybeSeed() {
      await seedCollectionIfEmpty('pjs', seedPJs)
      await seedCollectionIfEmpty('pnjs', seedPNJs)
      await seedCollectionIfEmpty('sesiones', seedSesiones)
      await seedCollectionIfEmpty('lugares', defaultData.lugares)
      await seedCollectionIfEmpty('facciones', defaultData.facciones)
      await seedCollectionIfEmpty('lore', defaultData.lore)
      await seedCollectionIfEmpty('game_pot', [{ id: 'current', cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }])
      await seedCollectionIfEmpty('game_config', [{
        id: 'loteria',
        commonMinRoll: 17,
        commonPrize: { cp: 3, sp: 0, ep: 0, gp: 0, pp: 0 },
        specialPrize: { cp: 0, sp: 1, ep: 0, gp: 0, pp: 0 },
      }])
      await seedCollectionIfEmpty('mapas', [])
      await seedCollectionIfEmpty('map_points', [])
      await seedCollectionIfEmpty('homebrew_rules', [])
      await seedCollectionIfEmpty('disponibilidad', [])
    }
    maybeSeed()

    const unsubs = COLLECTIONS.map(collName =>
      onSnapshot(collection(firestore, collName), snap => {
        const docs = snap.docs.map(d => d.data())
        if (collName === 'sesiones') docs.sort((a, b) => (a.orden ?? a.numero * 100) - (b.orden ?? b.numero * 100))
        setDb(prev => ({ ...prev, [collName]: docs }))
      })
    )
    return () => unsubs.forEach(u => u())
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (form) { setForm(null); return }
      if (detail) { setDetail(null) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [form, detail])

  function showToast(msg) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

  function unlockDM(password) {
    const dmPass = import.meta.env.VITE_DM_PASSWORD
    if (!dmPass) { alert('No hay contraseña DM configurada.'); return false }
    if (password === dmPass) {
      sessionStorage.removeItem('drakterima_player')
      setCurrentPlayer(null)
      sessionStorage.setItem('drakterima_dm', '1')
      setIsDM(true)
      showToast('Modo DM activado')
      return true
    }
    return false
  }

  function lockDM() {
    sessionStorage.removeItem('drakterima_dm')
    setIsDM(false)
    showToast('Modo Público activado')
  }

  function loginPlayer(password) {
    if (!password) return { success: false }
    const pj = (db.pjs || []).find(p => PLAYER_PASSWORDS[p.id] && PLAYER_PASSWORDS[p.id] === password)
    if (!pj) return { success: false }
    sessionStorage.removeItem('drakterima_dm')
    setIsDM(false)
    const player = { id: pj.id, nombre: pj.nombre }
    sessionStorage.setItem('drakterima_player', JSON.stringify(player))
    setCurrentPlayer(player)
    showToast(`Bienvenido/a, ${pj.nombre}`)
    const logId = `${Date.now()}_${pj.id}`
    setDoc(doc(firestore, 'login_logs', logId), {
      id: logId, playerId: pj.id, playerName: pj.nombre,
      timestamp: new Date().toISOString(),
    })
    return { success: true }
  }

  function logoutPlayer() {
    sessionStorage.removeItem('drakterima_player')
    setCurrentPlayer(null)
    showToast('Sesión cerrada')
  }

  async function savePlayerNote(pj_id, type, entity_id, text) {
    const docId = `${pj_id}_${type}_${entity_id}`
    await setDoc(doc(firestore, 'player_notes', docId), { id: docId, pj_id, type, entity_id, text })
    showToast('Nota guardada')
  }

  async function deletePlayerNote(note_id) {
    await deleteDoc(doc(firestore, 'player_notes', note_id))
    showToast('Nota eliminada')
  }

  async function saveGameResult(actorType, pjId, roll) {
    const config = (db.game_config || []).find(c => c.id === 'loteria') ?? {
      commonMinRoll: 17,
      commonPrize: { cp: 3, sp: 0, ep: 0, gp: 0, pp: 0 },
      specialPrize: { cp: 0, sp: 1, ep: 0, gp: 0, pp: 0 },
    }
    let prize = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
    if (roll === 20) prize = { ...config.specialPrize }
    else if (roll >= config.commonMinRoll) prize = { ...config.commonPrize }

    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const timestamp = now.toISOString()
    const logId = actorType === 'player'
      ? `${pjId}_loteria_${date}`
      : `dm_loteria_${Date.now()}`

    const batch = writeBatch(firestore)
    batch.set(doc(firestore, 'game_logs', logId), {
      id: logId, actorType, playerId: pjId ?? null,
      game: 'loteria', date, timestamp, roll, prize,
      prizeTarget: actorType === 'player' ? 'player' : 'pot',
    })

    if (actorType === 'player' && pjId != null) {
      const pj = (db.pjs || []).find(p => p.id === pjId)
      if (!pj) throw new Error(`PJ ${pjId} no encontrado`)
      const monedas = {
        cp: (pj.monedas?.cp || 0) + prize.cp,
        sp: (pj.monedas?.sp || 0) + prize.sp,
        ep: (pj.monedas?.ep || 0) + prize.ep,
        gp: (pj.monedas?.gp || 0) + prize.gp,
        pp: (pj.monedas?.pp || 0) + prize.pp,
      }
      const won = Object.values(prize).some(v => v > 0)
      batch.set(doc(firestore, 'pjs', String(pjId)), {
        ...pj, monedas, updatedAt: timestamp,
        ...(won && { sections_updated: { equipo: timestamp } }),
      }, { merge: true })
      if (won) batch.set(...sectionReadEntry(String(pjId), pjId, 'equipo', timestamp), { merge: true })
    } else {
      batch.set(doc(firestore, 'game_pot', 'current'), {
        cp: increment(prize.cp),
        sp: increment(prize.sp),
        ep: increment(prize.ep),
        gp: increment(prize.gp),
        pp: increment(prize.pp),
      }, { merge: true })
    }

    await batch.commit()
  }

  async function assignPotToPJ(pjId, amount) {
    const pot = (db.game_pot || []).find(p => p.id === 'current') ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
    const COIN_TYPES = ['cp', 'sp', 'ep', 'gp', 'pp']
    for (const coin of COIN_TYPES) {
      if ((amount[coin] || 0) > (pot[coin] || 0))
        throw new Error(`No hay suficiente ${coin} en el pozo.`)
    }
    const pj = (db.pjs || []).find(p => p.id === pjId)
    if (!pj) throw new Error(`PJ ${pjId} no encontrado`)

    const now = new Date().toISOString()
    const monedas = { ...pj.monedas }
    const potUpdate = {}
    for (const coin of COIN_TYPES) {
      monedas[coin] = (monedas[coin] || 0) + (amount[coin] || 0)
      potUpdate[coin] = increment(-(amount[coin] || 0))
    }

    const batch = writeBatch(firestore)
    batch.set(doc(firestore, 'game_pot', 'current'), potUpdate, { merge: true })
    const transferred = COIN_TYPES.some(coin => (amount[coin] || 0) > 0)
    batch.set(doc(firestore, 'pjs', String(pjId)), {
      ...pj, monedas, updatedAt: now,
      ...(transferred && { sections_updated: { equipo: now } }),
    }, { merge: true })
    await batch.commit()
    showToast('Monedas transferidas')
  }

  async function saveGameConfig(config) {
    await setDoc(doc(firestore, 'game_config', 'loteria'), { ...config, id: 'loteria' }, { merge: true })
    showToast('Configuración guardada')
  }

  async function saveSessionScreen(layout) {
    await setDoc(doc(firestore, 'game_config', 'session_screen'), { ...layout, id: 'session_screen' }, { merge: true })
  }

  async function markRead(type, entityId) {
    const viewerId = getViewerId(isDM, currentPlayer)
    if (!viewerId) return
    const docId = `${viewerId}_${type}_${entityId}`
    await setDoc(doc(firestore, 'read_state', docId), {
      id: docId, viewerId, type, entityId, seenAt: new Date().toISOString(),
    }, { merge: true })
  }

  async function markSectionRead(pjId, sectionKey) {
    const viewerId = getViewerId(isDM, currentPlayer)
    if (!viewerId) return
    const now = new Date().toISOString()
    const updatedTs = (db.pjs || []).find(p => p.id === pjId)?.sections_updated?.[sectionKey]
    const seenAt = updatedTs && updatedTs > now ? updatedTs : now
    const [ref, data] = sectionReadEntry(viewerId, pjId, sectionKey, seenAt)
    await setDoc(ref, data, { merge: true })
  }

  function tryAccess(password) {
    const dmPass = import.meta.env.VITE_DM_PASSWORD
    if (dmPass && password === dmPass) {
      sessionStorage.removeItem('drakterima_player')
      setCurrentPlayer(null)
      sessionStorage.setItem('drakterima_dm', '1')
      setIsDM(true)
      showToast('Modo DM activado')
      return { success: true }
    }
    return loginPlayer(password)
  }

  function exportData() {
    const json = JSON.stringify(db, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `drakterima-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Datos exportados')
  }

  const ARTICLE_KEYS = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'player_notes']

  function exportArticles() {
    const data = Object.fromEntries(ARTICLE_KEYS.map(k => [k, db[k] ?? []]))
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `drakterima-articulos-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Artículos exportados')
  }

  function importData(file) {
    const reader = new FileReader()
    reader.onload = async e => {
      try {
        const parsed = JSON.parse(e.target.result)
        const keys = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items']
        if (!keys.some(k => Array.isArray(parsed[k]))) {
          alert('Archivo inválido: no contiene datos de Drakterima.')
          return
        }
        if (!confirm('¿Reemplazar todos los datos actuales con los del archivo importado? Esta acción no se puede deshacer.')) return
        const batch = writeBatch(firestore)
        for (const key of keys) {
          if (!Array.isArray(parsed[key])) continue
          for (const item of parsed[key]) {
            batch.set(doc(firestore, key, String(item.id)), item)
          }
        }
        await batch.commit()
        showToast('Datos importados')
      } catch {
        alert('Error al leer el archivo JSON.')
      }
    }
    reader.readAsText(file)
  }

  async function save(type, data) {
    const isNew = data.id == null
    const id = data.id ?? nextId(db[type] || [])
    const now = new Date().toISOString()
    const existing = isNew ? null : (db[type] || []).find(e => e.id === data.id)
    const createdAt = isNew ? now : (existing?.createdAt ?? now)
    const viewerId = getViewerId(isDM, currentPlayer)
    if (type === 'pjs') {
      const changed = existing ? changedPjSections(existing, data) : ['general']
      const sections_updated = {
        ...(existing?.sections_updated ?? {}),
        ...Object.fromEntries(changed.map(k => [k, now])),
      }
      await setDoc(doc(firestore, type, String(id)), { ...data, id, createdAt, updatedAt: now, sections_updated })
      if (viewerId && changed.length > 0) {
        const batch = writeBatch(firestore)
        for (const k of changed) batch.set(...sectionReadEntry(viewerId, id, k, now), { merge: true })
        await batch.commit()
      }
    } else {
      await setDoc(doc(firestore, type, String(id)), { ...data, id, createdAt, updatedAt: now })
    }
    if (type !== 'pjs' && UNREAD_TYPES.includes(type)) {
      if (viewerId) {
        const readDocId = `${viewerId}_${type}_${id}`
        await setDoc(doc(firestore, 'read_state', readDocId), {
          id: readDocId, viewerId, type, entityId: id, seenAt: now,
        }, { merge: true })
      }
    }
    setForm(null)
    showToast('Guardado')
  }

  async function remove(type, id) {
    if (!confirm('¿Eliminar este registro?')) return
    await deleteDoc(doc(firestore, type, String(id)))
    setForm(null)
    setDetail(null)
    showToast('Eliminado')
  }

  function navigate(p) {
    setPage(p)
    setDetail(null)
    setPendingDetail(null)
  }

  function goToDetail(p, id) {
    window.scrollTo(0, 0)
    setPage(p)
    setDetail(null)
    setPendingDetail({ id })
  }

  const activeFieldRef = useRef(null)

  const ctx = {
    db,
    save,
    remove,
    navigate,
    goToDetail,
    pendingDetail,
    consumePendingDetail: () => setPendingDetail(null),
    openDetail: (type, id) => setDetail({ type, id }),
    closeDetail: () => setDetail(null),
    isDM,
    unlockDM,
    lockDM,
    currentPlayer,
    loginPlayer,
    logoutPlayer,
    savePlayerNote,
    deletePlayerNote,
    markRead,
    markSectionRead,
    saveGameResult,
    assignPotToPJ,
    saveGameConfig,
    saveSessionScreen,
    tryAccess,
    openForm: (type, id = null, prefill = null) => {
      if (type === 'disponibilidad') {
        const existing = id != null ? (db.disponibilidad || []).find(x => x.id === id) : null
        const tipo = existing?.tipo ?? prefill?.tipo ?? 'personal'
        if (tipo === 'sesion') {
          if (!isDM) return
          setForm({ type, id, prefill })
          return
        }
        if (!currentPlayer) return
        if (existing && existing.pj_id !== currentPlayer.id) return
        setForm({ type, id, prefill })
        return
      }
      if (isDM || (type === 'pjs' && id === currentPlayer?.id)) setForm({ type, id, prefill })
    },
    closeForm: () => setForm(null),
    showToast,
    sidebarOpen,
    toggleSidebar: () => setSidebarOpen(v => !v),
    sidebarCollapsed,
    toggleSidebarCollapsed: () => setSidebarCollapsed(v => {
      localStorage.setItem('drakterima_sidebar_collapsed', v ? '0' : '1')
      return !v
    }),
    exportData,
    exportArticles,
    importData,
    activeFieldRef,
  }

  const counts = {
    ...Object.fromEntries(
      ['pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'homebrew_rules']
        .map(k => [k, (db[k] || []).filter(e => isVisible(e, isDM, currentPlayer)).length])
    ),
    sesiones: (db.sesiones || []).filter(e => isVisible(e, isDM, currentPlayer) && e.tipo !== 'avance').length,
    notas: isDM
      ? (db.player_notes || []).filter(n => n.text?.trim()).length
      : currentPlayer
        ? (db.player_notes || []).filter(n => n.pj_id === currentPlayer.id && n.text?.trim()).length
        : 0,
  }

  const PageComponent = PAGES[page] || Dashboard

  return (
    <AppContext.Provider value={ctx}>
      <Header />
      <div className="flex min-h-screen pt-[60px]">
        <Sidebar currentPage={page} counts={counts} />
        {/* Overlay to close sidebar on mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-[150] bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <main className={`${sidebarCollapsed ? 'md:ml-0' : 'md:ml-[240px]'} max-md:ml-0 transition-[margin] duration-[250ms] ease-in-out flex-1 min-w-0 py-8 ${page === 'mapas' || page === 'sessionScreen' ? '' : 'px-10 max-md:p-5 max-w-[1100px]'}`}>
          <Suspense fallback={<div className="p-10 text-center text-txt-muted">Cargando…</div>}>
            <PageComponent />
          </Suspense>
        </main>
      </div>
      {detail && <DetailPanel detail={detail} />}
      {form && <FormModal form={form} />}
      {toastMsg && <Toast message={toastMsg} />}
    </AppContext.Provider>
  )
}
