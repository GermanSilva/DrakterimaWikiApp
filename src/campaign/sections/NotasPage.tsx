import { useMemo, useState } from 'react'
import { NotebookPen, Search, Trash2 } from 'lucide-react'
import { PageHeader } from '../../components/Shared'
import { btnSecondary } from '../../constants'
import { usePlayerNotesPort, type PlayerNoteListing } from '../../ports'
import { useCampaign } from '../CampaignContext'
import { useWikiIndex } from '../entities/useWikiIndex'
import { entityPath } from '../navigation'
import { ConfirmDeleteDialog, NoteDetailDialog } from '../notes/NoteDialogs'
import {
  authorName, filterNotes, groupByAuthor, hasText, highlightSegments, isChipActive, parseQuery, toggleChip, typeLabel,
  typesPresent,
} from '../notes/notesSearch'
import { useToast } from '../toastContext'
import { Loading } from './DetailNotice'

const PILL = 'font-exo text-[10px] tracking-[0.1em] uppercase border transition-colors cursor-pointer'
const pillState = (active: boolean) =>
  active ? 'border-accent bg-accent/10 text-txt-primary' : 'border-border-base text-txt-muted hover:border-border-light hover:text-txt-secondary'

interface NoteRef {
  type: string
  id: number
  key: string
}
const sameRef = (a: NoteRef, b: NoteRef) => a.type === b.type && a.id === b.id && a.key === b.key

function Highlight({ text, term }: { text: string; term: string }) {
  return (
    <>
      {highlightSegments(text, term).map((s, i) =>
        s.match ? (
          <mark key={i} className="bg-accent/25 text-inherit rounded-[2px]">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  )
}

function NoteCard({
  note, name, term, onOpen, onDelete,
}: {
  note: PlayerNoteListing
  name: string
  term: string
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <div className="relative bg-bg-card border border-border-base transition-colors hover:border-accent-dim hover:bg-bg-card-hover">
      <button type="button" onClick={onOpen} className="block w-full text-left px-5 py-4 pr-12 cursor-pointer">
        <span className="flex items-center gap-2 mb-2">
          <span className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.03em]">
            <Highlight text={name} term={term} />
          </span>
          <span className="font-exo text-[10px] tracking-[0.15em] uppercase text-txt-muted bg-border-light px-1.5 py-0.5 rounded-sm">
            {typeLabel(note.type)}
          </span>
        </span>
        <span className="block text-[13px] text-txt-secondary leading-[1.65] line-clamp-3">
          <Highlight text={note.text} term={term} />
        </span>
      </button>
      <button
        type="button"
        aria-label={`Eliminar nota de ${name}`}
        className="absolute top-3 right-3 p-1 text-txt-muted hover:text-red-400 transition-colors cursor-pointer"
        onClick={onDelete}
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

/** `/c/:slug/notas`: the viewer's notes (DM: every author's, grouped by author) with `[tipo] texto` search. */
export function NotasPage() {
  const port = usePlayerNotesPort()
  const { campaign, isDM } = useCampaign()
  const { byTable } = useWikiIndex()
  const { showToast } = useToast()
  const [query, setQuery] = useState('')
  const [authorKey, setAuthorKey] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ kind: 'view' | 'confirm'; ref: NoteRef; from: 'card' | 'view' } | null>(null)

  const nameOf = useMemo(() => {
    const titles = new Map<string, string>()
    for (const [table, items] of Object.entries(byTable)) for (const it of items) titles.set(`${table}:${it.id}`, it.title)
    // sessions may have no title: never leave the note unnamed
    return (type: string, id: number) => titles.get(`${type}:${id}`) || (type === 'sesiones' ? `Sesión #${id}` : `#${id}`)
  }, [byTable])

  // A port write resolves `false` when it failed and already told the user (hub), nothing when it succeeded
  // (legacy), or rejects (legacy has no failure channel): a rejection must not escape from the dialog.
  const attempt = async (write: () => Promise<boolean | void>, failure: string) => {
    try {
      return (await write()) !== false
    } catch (err) {
      console.error(failure, err)
      showToast(failure, 'error')
      return false
    }
  }

  const header = (
    <PageHeader eyebrow="Registro" title="Notas" titleAs="h1">
      {null}
    </PageHeader>
  )

  if (port.role === 'none') {
    return (
      <div>
        {header}
        <p className="text-txt-muted text-[13px] italic mt-8">Accedé para ver tus notas.</p>
      </div>
    )
  }
  if (port.loading) {
    return (
      <div>
        {header}
        <Loading />
      </div>
    )
  }
  if (port.failed) {
    return (
      <div>
        {header}
        <p role="alert" className="text-sm text-txt-secondary">
          No pudimos cargar las notas.{' '}
          {port.reload && (
            <button type="button" className={btnSecondary} onClick={port.reload}>
              Reintentar
            </button>
          )}
        </p>
      </div>
    )
  }

  const active = port.all().filter(hasText)
  const groupsAll = groupByAuthor(active)
  const effectiveAuthor = isDM && groupsAll.some((g) => g.key === authorKey) ? authorKey : null
  const inScope = effectiveAuthor ? active.filter((n) => n.key === effectiveAuthor) : active
  const parsed = parseQuery(query)
  const shown = filterNotes(inScope, parsed, nameOf)
  const groups = isDM ? groupByAuthor(shown) : []

  const bylineOf = (n: PlayerNoteListing) => (isDM ? [authorName(n), n.label].filter((p, i, a) => p && a.indexOf(p) === i).join(' · ') : '')
  const find = (ref: NoteRef) => active.find((n) => sameRef(n, ref))
  const current = dialog ? find(dialog.ref) : undefined

  const card = (n: PlayerNoteListing) => (
    <NoteCard
      key={`${n.key}:${n.type}:${n.id}`}
      note={n}
      name={nameOf(n.type, n.id)}
      term={parsed.textFilter}
      onOpen={() => setDialog({ kind: 'view', ref: n, from: 'view' })}
      onDelete={() => setDialog({ kind: 'confirm', ref: n, from: 'card' })}
    />
  )

  return (
    <div>
      {header}
      {active.length === 0 ? (
        <p className="text-txt-muted text-[13px] italic mt-8">
          {isDM ? 'No hay notas de jugadores todavía.' : 'Todavía no tenés notas guardadas.'}
        </p>
      ) : (
        <>
          <div className="mb-6">
            <div className="relative">
              <Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted pointer-events-none" />
              <input
                type="text"
                aria-label="Buscar notas"
                className="w-full bg-bg-mid border border-border-base text-txt-primary text-[13px] font-[inherit] pl-8 pr-3 py-2 outline-none transition-colors focus:border-accent-dim placeholder:text-txt-muted"
                placeholder="Buscar… o [sección] texto"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {typesPresent(inScope).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={isChipActive(query, type)}
                  className={`${PILL} px-2.5 py-1 ${pillState(isChipActive(query, type))}`}
                  onClick={() => setQuery(toggleChip(query, type))}
                >
                  {typeLabel(type)}
                </button>
              ))}
            </div>
          </div>

          {isDM && (
            <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Filtrar por autor">
              <button type="button" aria-pressed={effectiveAuthor === null} className={`${PILL} px-3 py-1.5 ${pillState(effectiveAuthor === null)}`} onClick={() => setAuthorKey(null)}>
                Todas
              </button>
              {groupsAll.map((g) => (
                <button key={g.key} type="button" aria-pressed={effectiveAuthor === g.key} className={`${PILL} px-3 py-1.5 ${pillState(effectiveAuthor === g.key)}`} onClick={() => setAuthorKey(g.key)}>
                  {g.name}
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <p className="text-txt-muted text-[13px] italic mt-4">No hay notas que coincidan con «{query}».</p>
          ) : isDM ? (
            groups.map((g) => (
              <section key={g.key} aria-label={`Notas de ${g.name}`} className="mb-8">
                <h2 className="flex items-center gap-2 mb-3 font-exo text-[11px] font-semibold tracking-[0.2em] text-txt-muted uppercase">
                  <NotebookPen size={13} aria-hidden="true" />
                  {g.name}
                  {g.characters.length > 0 && <span className="normal-case tracking-normal font-normal">· {g.characters.join(', ')}</span>}
                </h2>
                <div className="flex flex-col gap-2.5">{g.notes.map(card)}</div>
              </section>
            ))
          ) : (
            <div className="flex flex-col gap-2.5">{shown.map(card)}</div>
          )}
        </>
      )}

      {dialog && current && dialog.kind === 'view' && (
        <NoteDetailDialog
          note={{ type: current.type, text: current.text, name: nameOf(current.type, current.id), byline: bylineOf(current), href: entityPath(campaign.slug, current.type, current.id) }}
          onSave={(text) => attempt(() => port.save(current.type, current.id, text, current.key), 'No se pudo guardar la nota')}
          onDelete={() => setDialog({ kind: 'confirm', ref: dialog.ref, from: 'view' })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && current && dialog.kind === 'confirm' && (
        <ConfirmDeleteDialog
          note={{ type: current.type, name: nameOf(current.type, current.id), byline: bylineOf(current) }}
          onCancel={() => setDialog(dialog.from === 'view' ? { ...dialog, kind: 'view' } : null)}
          onConfirm={async () => {
            if (await attempt(() => port.remove(current.type, current.id, current.key), 'No se pudo eliminar la nota')) setDialog(null)
          }}
        />
      )}
    </div>
  )
}
