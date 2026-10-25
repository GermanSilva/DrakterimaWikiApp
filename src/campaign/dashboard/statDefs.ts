import { BookOpen, Landmark, Map, Scroll, Shield, Users } from 'lucide-react'
import type { Stat } from './StatsRow'

export const STAT_DEFS: Pick<Stat, 'key' | 'label' | 'path' | 'Icon'>[] = [
  { key: 'sesiones', label: 'Sesiones', path: 'sesiones', Icon: Scroll },
  { key: 'pjs', label: 'Jugadores', path: 'pjs', Icon: Shield },
  { key: 'pnjs', label: 'PNJs', path: 'pnjs', Icon: Users },
  { key: 'lugares', label: 'Lugares', path: 'lugares', Icon: Map },
  { key: 'facciones', label: 'Facciones', path: 'facciones', Icon: Landmark },
  { key: 'lore', label: 'Lore', path: 'lore', Icon: BookOpen },
]
