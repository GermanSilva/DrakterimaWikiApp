import { lazy, type ComponentType } from 'react'
import {
  BookMarked, BookOpen, CalendarDays, Dices, Gem, Hammer, Landmark, Map, NotebookPen, Scroll, Shield,
  SlidersHorizontal, Users, type LucideIcon,
} from 'lucide-react'

export interface SectionPageProps {
  section: SectionDef
  /** Second path segment (`/c/:slug/:section/:id`), untouched. Never interpolated into a query. */
  id?: string
}

export interface SectionDef {
  /** Stable key; also the URL segment (`/c/:slug/<path>`). */
  key: string
  label: string
  path: string
  group: string
  icon: LucideIcon
  /** Hidden from the nav AND unreachable (404 in layout) for players. The DB stays the real boundary. */
  dmOnly?: boolean
  /**
   * The page. H7-H9 replace the lazy placeholder with `lazy(() => import('../pages/...'))` for the
   * section they port; nothing else in the shell changes.
   */
  Component: ComponentType<SectionPageProps>
}

const Placeholder = lazy(() => import('./SectionPlaceholder').then((m) => ({ default: m.SectionPlaceholder })))

const section = (
  key: string,
  label: string,
  group: string,
  icon: LucideIcon,
  extra: { dmOnly?: boolean } = {},
): SectionDef => ({ key, label, path: key, group, icon, Component: Placeholder, ...extra })

/** Single registry of campaign sections: nav, routing and role gating all read it. */
export const SECTIONS: readonly SectionDef[] = [
  section('notas', 'Notas', 'Principal', NotebookPen),
  section('sesiones', 'Sesiones', 'Principal', Scroll),
  section('calendario', 'Calendario', 'Principal', CalendarDays),
  section('pjs', 'Jugadores (PJ)', 'Personajes', Shield),
  section('pnjs', 'PNJs', 'Personajes', Users),
  section('mapas', 'Mapas', 'Mundo', Map),
  section('lugares', 'Lugares', 'Mundo', Map),
  section('facciones', 'Facciones', 'Mundo', Landmark),
  section('lore', 'Lore', 'Mundo', BookOpen),
  section('homerules', 'Homerules', 'Homebrew', Hammer),
  section('items', 'Ítems', 'Homebrew', Gem),
  section('juegos', 'Juegos', 'Homebrew', Dices),
  section('srd', 'SRD / Reglas', 'Referencia', BookMarked),
  section('ajustes', 'Ajustes', 'Administración', SlidersHorizontal, { dmOnly: true }),
]

export function findSection(path: string | undefined): SectionDef | undefined {
  return SECTIONS.find((s) => s.path === path)
}

export function sectionsFor(isDM: boolean): SectionDef[] {
  return SECTIONS.filter((s) => !s.dmOnly || isDM)
}

/** Sections grouped for the sidebar, preserving registry order. */
export function groupSections(list: readonly SectionDef[]): { group: string; items: SectionDef[] }[] {
  const groups: { group: string; items: SectionDef[] }[] = []
  for (const item of list) {
    const found = groups.find((g) => g.group === item.group)
    if (found) found.items.push(item)
    else groups.push({ group: item.group, items: [item] })
  }
  return groups
}
