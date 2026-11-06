/** One sheet with two Habilidad tables, plus entries and links, shared by the action collection tests. */
import type { CampaignAction, PjActionLink } from '../../../data'
import { dnd5eProfile } from '../systemProfile'
import { validateSheet, type Sheet } from '../sheet/sheetModel'

type Loose = Record<string, unknown>
const column = (key: string, type: string, extra: Loose = {}) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1), type, editableBy: 'player', ...extra })

const RAW = {
  categories: [
    {
      key: 'mecanicas',
      label: 'Mecánicas',
      sections: [
        {
          key: 'magia',
          label: 'Magia',
          items: [
            // the player edits this table: every column is player-editable
            {
              kind: 'table', type: 'habilidad', key: 'hechizos', label: 'Hechizos', editableBy: 'player',
              categories: [{ key: 'truco', label: 'Trucos' }, { key: 'nivel1', label: 'Nivel 1' }],
              columns: [
                column('nombre', 'short'),
                column('categoria', 'short'),
                column('escuela', 'short', { scope: 'entry' }),
                column('alcance', 'number', { scope: 'entry' }),
                column('preparado', 'boolean', { scope: 'character' }),
                column('usos', 'number', { scope: 'character' }),
                column('calidad', 'options', { scope: 'character', display: 'select', options: [{ key: 'baja', label: 'Baja' }, { key: 'alta', label: 'Alta' }] }),
              ],
            },
            // the DM edits this one; no declared categories (free text)
            {
              kind: 'table', type: 'habilidad', key: 'rasgos', label: 'Rasgos', editableBy: 'dm',
              columns: [
                column('nombre', 'short', { editableBy: 'dm' }),
                column('categoria', 'short', { editableBy: 'dm' }),
                column('fuente', 'short', { editableBy: 'dm', scope: 'entry' }),
                column('cargas', 'number', { editableBy: 'dm', scope: 'character' }),
              ],
            },
          ],
          blocks: [{ key: 'magia_modal', mode: 'modal', title: 'Hechizos', items: ['hechizos'], filterCategories: ['truco', 'nivel1'] }, { key: 'rasgos_modal', mode: 'modal', title: 'Rasgos', items: ['rasgos'], filterCategories: ['Clase', 'Especie'] }],
        },
      ],
    },
  ],
  roles: {},
}
const parsed = validateSheet(RAW)
if (!parsed.ok) throw new Error(`fixture sheet invalid: ${JSON.stringify(parsed.errors)}`)
export const ACTION_SHEET: Sheet = parsed.sheet

/** The `campaign` override of renderSection with the sheet stored in the system document. */
export const withActionSheet = (sheet: unknown = RAW) => ({ system_profile: { ...dnd5eProfile(), sheet } as unknown as Record<string, unknown> })

export const action = (id: number, over: Partial<CampaignAction> = {}): CampaignAction => ({
  id, campaign_id: 'c1', table_key: 'hechizos', category: 'truco', name: `Acción ${id}`, description: '', extras: {}, private_to_pj: null,
  function: null, created_by: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...over,
})
export const link = (pj: number, actionId: number, state: Record<string, unknown> = {}): PjActionLink => ({
  pj_id: pj, action_id: actionId, campaign_id: 'c1', state, created_at: '2026-01-01T00:00:00Z', updated_at: 'l1',
})
