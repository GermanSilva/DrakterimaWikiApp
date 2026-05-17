import { useState, useEffect } from 'react'
import { AppContext } from './AppContext'
import { defaultData, seedPJs, seedPNJs, seedSesiones, STORAGE_KEY } from './seed'
import { nextId } from './helpers'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import DetailPanel from './components/DetailPanel'
import FormModal from './components/FormModal'
import Toast from './components/Toast'
import Dashboard from './pages/Dashboard'
import Sesiones from './pages/Sesiones'
import PJs from './pages/PJs'
import PNJs from './pages/PNJs'
import Lugares from './pages/Lugares'
import Facciones from './pages/Facciones'
import Lore from './pages/Lore'
import Items from './pages/Items'

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const base = JSON.parse(JSON.stringify(defaultData))
    if (!raw) return base
    return Object.assign(base, JSON.parse(raw))
  } catch {
    return JSON.parse(JSON.stringify(defaultData))
  }
}

function initDb() {
  const data = loadData()
  let changed = false
  if (!data.pjs.length) { data.pjs = JSON.parse(JSON.stringify(seedPJs)); changed = true }
  if (!data.pnjs.length) { data.pnjs = JSON.parse(JSON.stringify(seedPNJs)); changed = true }
  if (!data.sesiones.length) { data.sesiones = JSON.parse(JSON.stringify(seedSesiones)); changed = true }
  if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  return data
}

const PLAYER_PASSWORDS = {
  1: import.meta.env.VITE_PLAYER_1_PASSWORD,
  2: import.meta.env.VITE_PLAYER_2_PASSWORD,
  3: import.meta.env.VITE_PLAYER_3_PASSWORD,
  4: import.meta.env.VITE_PLAYER_4_PASSWORD,
  5: import.meta.env.VITE_PLAYER_5_PASSWORD,
  6: import.meta.env.VITE_PLAYER_6_PASSWORD,
}

const GITHUB_OWNER = 'GermanSilva'
const GITHUB_REPO  = 'DrakterimaWikiApp'
const GITHUB_FILE  = 'data/db.json'
const GITHUB_BRANCH = 'main'
const RAW_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_FILE}`
const API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN

let pushQueue = Promise.resolve()

async function pushToGitHub(data) {
  if (!GITHUB_TOKEN) return
  pushQueue = pushQueue.then(async () => {
    const headers = {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    const getResp = await fetch(API_URL, { headers })
    if (!getResp.ok) throw new Error(`GitHub GET ${getResp.status}`)
    const { sha } = await getResp.json()
    const encoded = new TextEncoder().encode(JSON.stringify(data, null, 2))
    const content = btoa(String.fromCharCode(...encoded))
    const putResp = await fetch(API_URL, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `wiki: auto-save ${new Date().toISOString()}`,
        content,
        sha,
        branch: GITHUB_BRANCH,
      }),
    })
    if (!putResp.ok) throw new Error(`GitHub PUT ${putResp.status}`)
  }).catch(err => { throw err })
  return pushQueue
}

const PAGES = {
  dashboard: Dashboard,
  sesiones: Sesiones,
  pjs: PJs,
  pnjs: PNJs,
  lugares: Lugares,
  facciones: Facciones,
  lore: Lore,
  items: Items,
}

export default function App() {
  const [db, setDb] = useState(initDb)
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState(null)
  const [page, setPage] = useState('dashboard')
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(null)
  const [toastMsg, setToastMsg] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pendingDetail, setPendingDetail] = useState(null)
  const [isDM, setIsDM] = useState(() => sessionStorage.getItem('drakterima_dm') === '1')
  const [currentPlayer, setCurrentPlayer] = useState(() => {
    try {
      const raw = sessionStorage.getItem('drakterima_player')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })

  useEffect(() => {
    async function syncFromRemote() {
      try {
        const resp = await fetch(`${RAW_URL}?t=${Date.now()}`, { cache: 'no-store' })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const remote = await resp.json()
        const merged = Object.assign(JSON.parse(JSON.stringify(defaultData)), remote)
        setDb(merged)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      } catch (err) {
        console.warn('Remote sync failed, using localStorage:', err.message)
      } finally {
        setLoading(false)
      }
    }
    syncFromRemote()
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

  function persistDb(newDb) {
    setDb(newDb)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newDb))
    if (!GITHUB_TOKEN) return
    setSyncStatus('saving')
    pushToGitHub(newDb)
      .then(() => { setSyncStatus('saved'); setTimeout(() => setSyncStatus(null), 2000) })
      .catch(() => {
        setSyncStatus('error')
        showToast('Error al sincronizar con GitHub. Cambios guardados localmente.')
      })
  }

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
    showToast('Modo jugador activado')
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
    return { success: true }
  }

  function logoutPlayer() {
    sessionStorage.removeItem('drakterima_player')
    setCurrentPlayer(null)
    showToast('Sesión cerrada')
  }

  function savePlayerNote(pj_id, type, entity_id, text) {
    const notes = [...(db.player_notes || [])]
    const i = notes.findIndex(n => n.pj_id === pj_id && n.type === type && n.entity_id === entity_id)
    if (i >= 0) { notes[i] = { ...notes[i], text } }
    else { notes.push({ id: nextId(notes), pj_id, type, entity_id, text }) }
    persistDb({ ...db, player_notes: notes })
    showToast('Nota guardada')
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

  function importData(file) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result)
        const keys = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items']
        if (!keys.some(k => Array.isArray(parsed[k]))) {
          alert('Archivo inválido: no contiene datos de Drakterima.')
          return
        }
        if (!confirm('¿Reemplazar todos los datos actuales con los del archivo importado? Esta acción no se puede deshacer.')) return
        const base = JSON.parse(JSON.stringify(defaultData))
        persistDb(Object.assign(base, parsed))
        showToast('Datos importados')
      } catch {
        alert('Error al leer el archivo JSON.')
      }
    }
    reader.readAsText(file)
  }

  function save(type, data) {
    const arr = [...(db[type] || [])]
    if (data.id) {
      const i = arr.findIndex(x => x.id === data.id)
      if (i >= 0) arr[i] = data; else arr.push(data)
    } else {
      arr.push({ ...data, id: nextId(arr) })
    }
    if (type === 'sesiones') arr.sort((a, b) => a.numero - b.numero)
    persistDb({ ...db, [type]: arr })
    setForm(null)
    showToast('Guardado')
  }

  function remove(type, id) {
    if (!confirm('¿Eliminar este registro?')) return
    persistDb({ ...db, [type]: (db[type] || []).filter(x => x.id !== id) })
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
    setPage(p)
    setDetail(null)
    setPendingDetail({ id })
  }

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
    tryAccess,
    openForm: (type, id = null) => { if (isDM) setForm({ type, id }) },
    closeForm: () => setForm(null),
    showToast,
    syncStatus,
    loading,
    sidebarOpen,
    toggleSidebar: () => setSidebarOpen(v => !v),
    exportData,
    importData,
  }

  const counts = Object.fromEntries(
    ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items']
      .map(k => [k, (db[k] || []).length])
  )

  const PageComponent = PAGES[page] || Dashboard

  return (
    <AppContext.Provider value={ctx}>
      <Header />
      <div id="layout" className={sidebarOpen ? 'sidebar-open' : ''}>
        <Sidebar currentPage={page} counts={counts} />
        <main id="main">
          <PageComponent />
        </main>
      </div>
      {detail && <DetailPanel detail={detail} />}
      {form && <FormModal form={form} />}
      {toastMsg && <Toast message={toastMsg} />}
    </AppContext.Provider>
  )
}
