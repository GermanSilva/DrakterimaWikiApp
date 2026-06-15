import { useState } from 'react'
import SpellsTab from '../srd/SpellsTab'
import MonstersTab from '../srd/MonstersTab'
import ConditionsTab from '../srd/ConditionsTab'
import WeaponsTab from '../srd/WeaponsTab'
import ArmorsTab from '../srd/ArmorsTab'
import MagicItemsTab from '../srd/MagicItemsTab'

const TABS = [
  { id: 'spells',     label: 'Hechizos',      component: SpellsTab },
  { id: 'monsters',   label: 'Monstruos',      component: MonstersTab },
  { id: 'conditions', label: 'Condiciones',    component: ConditionsTab },
  { id: 'weapons',    label: 'Armas',          component: WeaponsTab },
  { id: 'armors',     label: 'Armaduras',      component: ArmorsTab },
  { id: 'magicitems', label: 'Ítems mágicos',  component: MagicItemsTab },
]

export default function SRD() {
  const [activeTab, setActiveTab] = useState('spells')
  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component

  return (
    <div>
      <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-5 font-medium">
        SRD · Referencia D&D 5e
      </div>

      <div className="flex border-b border-border-base overflow-x-auto mb-6 -mx-10 px-10 max-md:-mx-5 max-md:px-5">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'font-exo text-[10px] font-semibold tracking-[0.1em] uppercase px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors cursor-pointer bg-transparent shrink-0',
              activeTab === tab.id
                ? 'border-b-accent text-accent-bright'
                : 'border-b-transparent text-txt-muted hover:text-txt-secondary',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {ActiveComponent && <ActiveComponent key={activeTab} />}
    </div>
  )
}
