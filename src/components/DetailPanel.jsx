import { useApp } from '../AppContext'
import { X } from 'lucide-react'

const DETAIL_VIEWS = {}

export default function DetailPanel({ detail }) {
  const { db, closeDetail } = useApp()
  const item = (db[detail.type] || []).find(x => x.id === detail.id)
  const DetailView = DETAIL_VIEWS[detail.type]

  return (
    <div
      className="fixed inset-0 bg-black/[.78] z-[200] backdrop-blur-[3px] flex items-start justify-end"
      onClick={e => e.target.id === 'detail-overlay' && closeDetail()}
      id="detail-overlay"
    >
      <div className="w-[min(600px,90vw)] h-screen bg-bg-card border-l border-border-light overflow-y-auto p-8 animate-slide-in">
        <button
          className="float-right cursor-pointer text-txt-muted hover:text-accent-bright transition-colors bg-transparent border-none p-0"
          onClick={closeDetail}
        >
          <X size={20} />
        </button>
        {item && DetailView
          ? <DetailView item={item} />
          : <p className="text-txt-muted">No encontrado.</p>
        }
      </div>
    </div>
  )
}
