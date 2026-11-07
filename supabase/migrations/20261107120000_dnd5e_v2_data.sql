-- G10c of the system-agnostic campaigns (odd/tasks/system-agnostic.md S9, S17, S33, S35-S39). HIGH RISK: it rewrites stored character
-- data and the stored sheet of the campaigns that use the D&D preset. Twin of src/campaign/system/sheet/migration/migrateDnd5eV2.ts
-- (dnd5eV2Parity.test.ts and 35_dnd5e_v2_data.test.sql run the same fixture through both).
--
-- WHICH CAMPAIGNS: only those whose stored sheet IS the D&D preset: v1 (with or without the rewardDestination flag G5b added) or
-- v2, optionally plus the section of campaign fields this migration adds. Any other sheet (a custom one, an edited preset, one with
-- discarded fields) is left alone and reported with a NOTICE. Everything runs in this one transaction.
--
-- WHAT IT DOES per campaign, in this order:
--   1. copies the previous values of every row it will change into public.migration_backup_dnd5e_v2 (no API grants);
--   2. campaign sheet: v1 -> the v2 preset; the campaign custom fields (campaigns.character_custom_fields, kept as they are) become
--      paragraph fields of the section `campos_campana` (category historia). A key that collides with a sheet key becomes campo_<key>;
--   3. characters (pjs.data, pjs.jugador), see _dnd5e_v2_pj_data:
--        skill_* numbers 0/1/2          -> no / competente / experto (other values stay, counted as warnings)
--        stat_hit_dice "XdY (a/b)"      -> dado_golpe XdY + dados_disponibles a (b is ignored: the total is the level); "XdY" alone ->
--                                          dados_disponibles = nivel; unparseable text goes whole into dado_golpe; the key is dropped
--        spell_slots, spell_slots_current -> espacios_conjuro rows {id, nivel, disponibles, maximo} (absent current = full, maximo 0
--                                          rows dropped; an existing non-empty espacios_conjuro is kept); the old keys are dropped
--        recursos.recuperacion text     -> largo | corto (anything else: largo)
--        data.custom_fields.<k>         -> data.<k> (or data.campo_<k>); a flat key of the same name is already the target
--        jugador                        -> display_name of the assigned owner, '' when unowned (the legacy free text is discarded, S33)
--   4. hechizos rows -> campaign_actions entries (table hechizos) + pj_action_links (state {preparado}), S39: grouped by category +
--      lower(trim(name)); one holder, or identical content (name, description, extras) in every holder -> ONE shared entry linked by
--      all; different content -> one entry PRIVATE to each holder (they keep their name). nivel 0 -> trucos, 1..9 -> nivel_N, 10 ->
--      rasgos; descripcion -> description; casting_time -> extras.tiempo_lanzamiento; the other columns -> extras of the same key (only
--      non-empty text and true flags are stored). An entry that already exists (same table, category, name, character) is reused.
--      data.hechizos is removed. Writes run with no request identity, so pjs_enforce_jugador accepts jugador.
-- Warnings never print stored text: the NOTICE lines carry counts only.
--
-- IDEMPOTENT: a second run finds nothing to change (migrated data has none of the legacy keys; the sheet is recognised with or
-- without the campaign-fields section) and writes nothing, not even backup rows.
--
-- DRY RUN (nothing is kept):   begin;  <run this file's statements, or: select public._dnd5e_v2_migrate_campaign(id) from public.campaigns>;
--   then inspect (counts in the NOTICE lines, select count(*) from public.migration_backup_dnd5e_v2, campaign_actions, pj_action_links);  rollback;
--
-- ROLLBACK (manual, not part of the migration; restores the first backup of every row, so edits made after the migration to those
-- rows are lost). Run it in one transaction:
--   begin;
--   delete from public.pj_action_links l using public.migration_backup_dnd5e_v2 b, jsonb_array_elements(b.inserted_links) x
--     where b.pj_id is null and l.campaign_id = b.campaign_id and l.pj_id = (x ->> 0)::bigint and l.action_id = (x ->> 1)::bigint;
--   delete from public.campaign_actions a using public.migration_backup_dnd5e_v2 b
--     where b.pj_id is null and a.campaign_id = b.campaign_id and a.id = any (b.inserted_action_ids);
--   update public.pjs p set data = b.old_data, jugador = b.old_jugador from public.migration_backup_dnd5e_v2 b
--     where b.pj_id = p.id and b.campaign_id = p.campaign_id;
--   update public.campaigns c set system_profile = jsonb_set(c.system_profile, '{sheet}', b.old_sheet)
--     from public.migration_backup_dnd5e_v2 b where b.pj_id is null and b.campaign_id = c.id and b.old_sheet is not null;
--   -- afterwards (only when you also want the objects gone): drop table public.migration_backup_dnd5e_v2;
--   --   drop function public._dnd5e_v2_migrate_campaign(uuid), public._dnd5e_v2_spell_entries(jsonb), public._dnd5e_v2_spell_rows(bigint, jsonb),
--   --   public._dnd5e_v2_pj_data(jsonb, integer, jsonb), public._dnd5e_v2_custom_section(jsonb, jsonb), public._dnd5e_v2_sheet_kind(jsonb),
--   --   public._dnd5e_v2_strip_custom(jsonb), public._dnd5e_v2_recovery(jsonb), public._dnd5e_v2_text(jsonb), public._dnd5e_v2_whole(jsonb),
--   --   public._dnd5e_v2_sheet_v1(), public._dnd5e_v2_sheet_v2();
--   commit;

------------------------------------------------------------------------------
-- Backup table (campaign rows have pj_id null and carry the old sheet and what the run inserted)
------------------------------------------------------------------------------
create table public.migration_backup_dnd5e_v2 (
  pj_id               bigint,
  campaign_id         uuid not null,
  old_data            jsonb,
  old_jugador         text,
  old_sheet           jsonb,
  inserted_action_ids bigint[] not null default '{}',
  inserted_links      jsonb not null default '[]'::jsonb,
  migrated_at         timestamptz not null default now()
);
create unique index migration_backup_dnd5e_v2_pj_idx on public.migration_backup_dnd5e_v2 (pj_id) where pj_id is not null;
create unique index migration_backup_dnd5e_v2_campaign_idx on public.migration_backup_dnd5e_v2 (campaign_id) where pj_id is null;
alter table public.migration_backup_dnd5e_v2 enable row level security;
revoke all on public.migration_backup_dnd5e_v2 from anon, authenticated;

------------------------------------------------------------------------------
-- The two preset literals the stored sheet is recognised by (v1 = before G10b, with the G5b reward flag; v2 = DND5E_SHEET)
------------------------------------------------------------------------------
create function public._dnd5e_v2_sheet_v1()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select $sheet_v1${"categories":[{"key":"identidad_dnd","label":"Identidad D&D","sections":[{"key":"general","label":"General","items":[{"kind":"field","key":"trasfondo_dnd","label":"Trasfondo D&D","type":"short","editableBy":"player"},{"kind":"field","key":"alineamiento","label":"Alineamiento","type":"short","editableBy":"player"},{"kind":"field","key":"experiencia","label":"Experiencia (XP)","type":"number","editableBy":"dm","min":0}],"blocks":[{"key":"b_general","mode":"tile","items":["trasfondo_dnd","alineamiento","experiencia"]}]}]},{"key":"mecanicas","label":"Mecánicas","sections":[{"key":"stats","label":"Atributos y combate","items":[{"kind":"table","type":"stat","key":"tabla_stats","label":"Atributos","rows":[{"key":"stat_str","label":"FUE","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_dex","label":"DES","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_con","label":"CON","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_int","label":"INT","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_wis","label":"SAB","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_cha","label":"CAR","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"}]},{"kind":"field","key":"stat_hp","label":"HP máx.","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_hp_current","label":"HP actual","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_hp_temp","label":"HP temporal","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_ac","label":"AC","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_ac_temp","label":"AC temporal","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_speed","label":"Velocidad (ft)","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_initiative","label":"Iniciativa","type":"number","editableBy":"dm","format":"signed"},{"kind":"field","key":"stat_hit_dice","label":"Dados de golpe","type":"short","editableBy":"dm"},{"kind":"field","key":"stat_inspiration","label":"Inspiración","type":"boolean","editableBy":"dm"},{"kind":"field","key":"stat_proficiency_bonus","label":"Bono de competencia","type":"number","editableBy":"dm","formula":"2 + floor(({nivel} - 1) / 4)","overridable":true,"format":"signed"},{"kind":"field","key":"stat_death_saves_success","label":"Salvaciones de muerte: éxitos","type":"number","editableBy":"dm","min":0,"max":3},{"kind":"field","key":"stat_death_saves_failure","label":"Salvaciones de muerte: fallos","type":"number","editableBy":"dm","min":0,"max":3},{"kind":"field","key":"percepcion_pasiva","label":"Percepción pasiva","type":"number","editableBy":"dm","formula":"10 + {stat_wis.modificador} + si({skill_perception} > 0, {stat_proficiency_bonus}, 0) + si({skill_perception} > 1, {stat_proficiency_bonus}, 0)"}],"blocks":[{"key":"b_stats","mode":"stat","items":["tabla_stats"]},{"key":"b_vitals","title":"Combate","mode":"tile","items":["stat_hp","stat_hp_current","stat_hp_temp","stat_ac","stat_ac_temp","stat_speed","stat_initiative","stat_hit_dice","stat_inspiration","stat_proficiency_bonus","stat_death_saves_success","stat_death_saves_failure","percepcion_pasiva"]}]},{"key":"habilidades","label":"Salvaciones y habilidades","items":[{"kind":"table","type":"capacidades","key":"tabla_salvaciones","label":"Salvaciones","columns":[{"key":"competente","label":"Competente","type":"boolean","editableBy":"dm","default":false},{"key":"bono","label":"Bono","type":"number","formula":"{modificador} + si({competente}, {stat_proficiency_bonus}, 0)","format":"signed","editableBy":"dm"}],"rows":[{"key":"save_str","label":"Salvación","stat":"stat_str","use":"modificador","editableBy":"dm"},{"key":"save_dex","label":"Salvación","stat":"stat_dex","use":"modificador","editableBy":"dm"},{"key":"save_con","label":"Salvación","stat":"stat_con","use":"modificador","editableBy":"dm"},{"key":"save_int","label":"Salvación","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"save_wis","label":"Salvación","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"save_cha","label":"Salvación","stat":"stat_cha","use":"modificador","editableBy":"dm"}]},{"kind":"table","type":"capacidades","key":"tabla_habilidades","label":"Habilidades","columns":[{"key":"competencia","label":"Competencia (0-2)","type":"number","editableBy":"dm","default":0},{"key":"bono","label":"Bono","type":"number","formula":"{modificador} + si({competencia} > 0, {stat_proficiency_bonus}, 0) + si({competencia} > 1, {stat_proficiency_bonus}, 0)","format":"signed","editableBy":"dm"}],"rows":[{"key":"skill_athletics","label":"Atletismo","stat":"stat_str","use":"modificador","editableBy":"dm"},{"key":"skill_acrobatics","label":"Acrobacias","stat":"stat_dex","use":"modificador","editableBy":"dm"},{"key":"skill_sleight_of_hand","label":"Juego de Manos","stat":"stat_dex","use":"modificador","editableBy":"dm"},{"key":"skill_stealth","label":"Sigilo","stat":"stat_dex","use":"modificador","editableBy":"dm"},{"key":"skill_arcana","label":"Arcanismo","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_history","label":"Historia","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_investigation","label":"Investigación","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_nature","label":"Naturaleza","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_religion","label":"Religión","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_animal_handling","label":"Trato Animal","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_insight","label":"Perspicacia","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_medicine","label":"Medicina","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_perception","label":"Percepción","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_survival","label":"Supervivencia","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_deception","label":"Engaño","stat":"stat_cha","use":"modificador","editableBy":"dm"},{"key":"skill_intimidation","label":"Intimidación","stat":"stat_cha","use":"modificador","editableBy":"dm"},{"key":"skill_performance","label":"Actuación","stat":"stat_cha","use":"modificador","editableBy":"dm"},{"key":"skill_persuasion","label":"Persuasión","stat":"stat_cha","use":"modificador","editableBy":"dm"}]}],"blocks":[{"key":"b_caps","mode":"capacidades","items":["tabla_salvaciones","tabla_habilidades"]}]},{"key":"hechizos","label":"Hechizos","items":[{"kind":"field","key":"spell_dc","label":"DC de conjuración","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"spell_attack_bonus","label":"Bono de ataque de hechizo","type":"number","editableBy":"dm","format":"signed"},{"kind":"field","key":"spell_ability","label":"Característica de lanzamiento","type":"short","editableBy":"dm"},{"kind":"table","type":"libre","key":"espacios_conjuro","label":"Espacios de conjuro","columns":[{"key":"nivel","label":"Nivel","type":"number","editableBy":"dm"},{"key":"total","label":"Total","type":"number","editableBy":"dm"},{"key":"gastados","label":"Gastados","type":"number","editableBy":"dm"}],"editableBy":"dm"},{"kind":"table","type":"habilidad","key":"hechizos","label":"Hechizos","columns":[{"key":"nombre","label":"Nombre","type":"short","editableBy":"player"},{"key":"categoria","label":"Categoría","type":"short","editableBy":"player"},{"key":"nivel","label":"Nivel","type":"number","editableBy":"player"},{"key":"preparado","label":"Preparado","type":"boolean","editableBy":"player"},{"key":"escuela","label":"Escuela","type":"short","editableBy":"player"},{"key":"casting_time","label":"Tiempo de lanzamiento","type":"short","editableBy":"player"},{"key":"alcance","label":"Alcance","type":"short","editableBy":"player"},{"key":"componentes","label":"Componentes","type":"short","editableBy":"player"},{"key":"duracion","label":"Duración","type":"short","editableBy":"player"},{"key":"descripcion","label":"Descripción","type":"paragraph","editableBy":"player"}],"editableBy":"dm"}],"blocks":[{"key":"b_casting","mode":"tile","items":["spell_dc","spell_attack_bonus","spell_ability"]},{"key":"b_slots","mode":"plano","items":["espacios_conjuro"]},{"key":"b_spells","mode":"modal","items":["hechizos"],"filterCategories":["Truco","Nivel 1","Nivel 2","Nivel 3","Nivel 4","Nivel 5","Nivel 6","Nivel 7","Nivel 8","Nivel 9"]}]}]},{"key":"equipo_rasgos","label":"Equipo y rasgos","sections":[{"key":"ataques","label":"Ataques","items":[{"kind":"table","type":"libre","key":"ataques","label":"Ataques","columns":[{"key":"nombre","label":"Arma","type":"short","editableBy":"player"},{"key":"bono_ataque","label":"Bono de ataque","type":"short","editableBy":"player"},{"key":"dano","label":"Daño","type":"short","editableBy":"player"},{"key":"tipo_dano","label":"Tipo","type":"short","editableBy":"player"},{"key":"alcance","label":"Alcance","type":"short","editableBy":"player"},{"key":"notas","label":"Notas","type":"paragraph","editableBy":"player"},{"key":"precio","label":"Precio","type":"number","editableBy":"player"},{"key":"precio_moneda","label":"Moneda","type":"short","editableBy":"player"},{"key":"portando","label":"Portando","type":"boolean","editableBy":"player"}],"editableBy":"dm"}],"blocks":[{"key":"b_attacks","mode":"plano","items":["ataques"]}]},{"key":"recursos","label":"Recursos","items":[{"kind":"table","type":"libre","key":"recursos","label":"Recursos","columns":[{"key":"nombre","label":"Nombre","type":"short","editableBy":"player"},{"key":"maximo","label":"Máximo","type":"number","editableBy":"player"},{"key":"actual","label":"Actual","type":"number","editableBy":"player"},{"key":"recuperacion","label":"Recuperación","type":"short","editableBy":"player"},{"key":"notas","label":"Notas","type":"paragraph","editableBy":"player"}],"editableBy":"dm"}],"blocks":[{"key":"b_resources","mode":"plano","items":["recursos"]}]},{"key":"equipo","label":"Equipo","items":[{"kind":"table","type":"libre","key":"equipo","label":"Equipo","columns":[{"key":"nombre","label":"Nombre","type":"short","editableBy":"player"},{"key":"cantidad","label":"Cantidad","type":"number","editableBy":"player"},{"key":"descripcion","label":"Descripción","type":"paragraph","editableBy":"player"},{"key":"precio","label":"Precio","type":"number","editableBy":"player"},{"key":"precio_moneda","label":"Moneda","type":"short","editableBy":"player"},{"key":"portando","label":"Portando","type":"boolean","editableBy":"player"}],"editableBy":"dm"},{"kind":"table","type":"monedas","key":"dinero","label":"Dinero","rows":[{"key":"cp","label":"Cobre","value":1},{"key":"sp","label":"Plata","value":10},{"key":"ep","label":"Electrum","value":50},{"key":"gp","label":"Oro","value":100},{"key":"pp","label":"Platino","value":1000}],"rewardDestination":true}],"blocks":[{"key":"b_equipment","mode":"plano","items":["equipo"]},{"key":"b_coins","mode":"plano","items":["dinero"]}]},{"key":"rasgos","label":"Rasgos","items":[{"kind":"field","key":"rasgos_clase","label":"Rasgos de clase","type":"paragraph","editableBy":"dm"},{"kind":"field","key":"otros_rasgos","label":"Otros rasgos","type":"paragraph","editableBy":"dm"},{"kind":"field","key":"idiomas","label":"Idiomas","type":"short","editableBy":"dm"},{"kind":"field","key":"prof_armas","label":"Competencia con armas","type":"short","editableBy":"dm"},{"kind":"field","key":"prof_armaduras","label":"Competencia con armaduras","type":"short","editableBy":"dm"},{"kind":"field","key":"prof_herramientas","label":"Competencia con herramientas","type":"short","editableBy":"dm"}],"blocks":[{"key":"b_traits","mode":"tile","items":["rasgos_clase","otros_rasgos","idiomas","prof_armas","prof_armaduras","prof_herramientas"]}]}]},{"key":"historia","label":"Historia","sections":[{"key":"narrativa","label":"Narrativa","items":[{"kind":"field","key":"trasfondo","label":"Trasfondo","type":"paragraph","editableBy":"player"},{"kind":"field","key":"motivo","label":"Motivo","type":"paragraph","editableBy":"player"},{"kind":"field","key":"magralita","label":"Magralita","type":"paragraph","editableBy":"dm"}],"blocks":[{"key":"b_story","mode":"tile","items":["trasfondo","motivo","magralita"]}]},{"key":"apariencia","label":"Apariencia","items":[{"kind":"field","key":"edad","label":"Edad","type":"short","editableBy":"player"},{"kind":"field","key":"altura","label":"Altura","type":"short","editableBy":"player"},{"kind":"field","key":"peso","label":"Peso","type":"short","editableBy":"player"},{"kind":"field","key":"ojos","label":"Ojos","type":"short","editableBy":"player"},{"kind":"field","key":"piel","label":"Piel","type":"short","editableBy":"player"},{"kind":"field","key":"pelo","label":"Pelo","type":"short","editableBy":"player"},{"kind":"field","key":"apariencia","label":"Apariencia","type":"paragraph","editableBy":"player"},{"kind":"field","key":"personalidad","label":"Personalidad","type":"paragraph","editableBy":"player"},{"kind":"field","key":"ideales","label":"Ideales","type":"paragraph","editableBy":"player"},{"kind":"field","key":"vinculos","label":"Vínculos","type":"paragraph","editableBy":"player"},{"kind":"field","key":"defectos","label":"Defectos","type":"paragraph","editableBy":"player"}],"blocks":[{"key":"b_looks","mode":"tile","items":["edad","altura","peso","ojos","piel","pelo"]},{"key":"b_personality","mode":"tile","items":["apariencia","personalidad","ideales","vinculos","defectos"]}]}]}],"roles":{"hp":"stat_hp","hp_current":"stat_hp_current","ac":"stat_ac","speed":"stat_speed","initiative":"stat_initiative"}}$sheet_v1$::jsonb
$$;

create function public._dnd5e_v2_sheet_v2()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select $sheet_v2${"categories":[{"key":"identidad_dnd","label":"Identidad D&D","sections":[{"key":"general","label":"General","items":[{"kind":"field","key":"trasfondo_dnd","label":"Trasfondo D&D","type":"short","editableBy":"player"},{"kind":"field","key":"alineamiento","label":"Alineamiento","type":"short","editableBy":"player"},{"kind":"field","key":"experiencia","label":"Experiencia (XP)","type":"number","editableBy":"dm","min":0}],"blocks":[{"key":"b_general","mode":"tile","items":["trasfondo_dnd","alineamiento","experiencia"]}]}]},{"key":"mecanicas","label":"Mecánicas","sections":[{"key":"stats","label":"Atributos y combate","items":[{"kind":"table","type":"stat","key":"tabla_stats","label":"Atributos","rows":[{"key":"stat_str","label":"FUE","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_dex","label":"DES","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_con","label":"CON","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_int","label":"INT","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_wis","label":"SAB","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_cha","label":"CAR","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"}]},{"kind":"field","key":"dado_golpe","label":"Dado de golpe","type":"short","editableBy":"dm","default":""},{"kind":"field","key":"dados_disponibles","label":"Dados de golpe disponibles","type":"number","editableBy":"dm","min":0,"default":0},{"kind":"field","key":"stat_hp","label":"HP máx.","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_hp_current","label":"HP actual","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_hp_temp","label":"HP temporal","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_ac","label":"AC","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_ac_temp","label":"AC temporal","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_speed","label":"Velocidad (ft)","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_initiative","label":"Iniciativa","type":"number","editableBy":"dm","format":"signed"},{"kind":"field","key":"stat_hit_dice","label":"Dados de golpe","type":"short","editableBy":"dm","formula":"{dado_golpe} & \" (\" & {dados_disponibles} & \"/\" & {nivel} & \")\""},{"kind":"field","key":"stat_inspiration","label":"Inspiración","type":"boolean","editableBy":"dm"},{"kind":"field","key":"stat_proficiency_bonus","label":"Bono de competencia","type":"number","editableBy":"dm","formula":"2 + floor(({nivel} - 1) / 4)","overridable":true,"format":"signed"},{"kind":"field","key":"stat_death_saves_success","label":"Salvaciones de muerte: éxitos","type":"number","editableBy":"dm","min":0,"max":3},{"kind":"field","key":"stat_death_saves_failure","label":"Salvaciones de muerte: fallos","type":"number","editableBy":"dm","min":0,"max":3},{"kind":"field","key":"percepcion_pasiva","label":"Percepción pasiva","type":"number","editableBy":"dm","formula":"10 + {skill_perception}"}],"blocks":[{"key":"b_stats","mode":"stat","items":["tabla_stats"]},{"key":"b_vitals","title":"Combate","mode":"tile","items":["stat_hp","stat_hp_current","stat_hp_temp","stat_ac","stat_ac_temp","stat_speed","stat_initiative","stat_hit_dice","stat_inspiration","stat_proficiency_bonus","stat_death_saves_success","stat_death_saves_failure","percepcion_pasiva"]}]},{"key":"habilidades","label":"Salvaciones y habilidades","items":[{"kind":"table","type":"capacidades","key":"tabla_salvaciones","label":"Salvaciones","columns":[{"key":"competente","label":"Competente","type":"boolean","editableBy":"dm","default":false},{"key":"bono","label":"Bono","type":"number","formula":"{modificador} + si({competente}, {stat_proficiency_bonus}, 0)","format":"signed","editableBy":"dm"}],"rows":[{"key":"save_str","label":"Salvación","stat":"stat_str","use":"modificador","editableBy":"dm"},{"key":"save_dex","label":"Salvación","stat":"stat_dex","use":"modificador","editableBy":"dm"},{"key":"save_con","label":"Salvación","stat":"stat_con","use":"modificador","editableBy":"dm"},{"key":"save_int","label":"Salvación","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"save_wis","label":"Salvación","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"save_cha","label":"Salvación","stat":"stat_cha","use":"modificador","editableBy":"dm"}]},{"kind":"table","type":"capacidades","key":"tabla_habilidades","label":"Habilidades","columns":[{"key":"competencia","label":"Competencia","type":"options","display":"select","format":"signed","default":"no","editableBy":"dm","options":[{"key":"no","label":"No competente","formula":"{modificador}"},{"key":"competente","label":"Competente","formula":"{modificador} + {stat_proficiency_bonus}"},{"key":"experto","label":"Experto","formula":"{modificador} + {stat_proficiency_bonus} * 2"}]}],"rows":[{"key":"skill_athletics","label":"Atletismo","stat":"stat_str","use":"modificador","editableBy":"dm"},{"key":"skill_acrobatics","label":"Acrobacias","stat":"stat_dex","use":"modificador","editableBy":"dm"},{"key":"skill_sleight_of_hand","label":"Juego de Manos","stat":"stat_dex","use":"modificador","editableBy":"dm"},{"key":"skill_stealth","label":"Sigilo","stat":"stat_dex","use":"modificador","editableBy":"dm"},{"key":"skill_arcana","label":"Arcanismo","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_history","label":"Historia","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_investigation","label":"Investigación","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_nature","label":"Naturaleza","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_religion","label":"Religión","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_animal_handling","label":"Trato Animal","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_insight","label":"Perspicacia","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_medicine","label":"Medicina","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_perception","label":"Percepción","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_survival","label":"Supervivencia","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_deception","label":"Engaño","stat":"stat_cha","use":"modificador","editableBy":"dm"},{"key":"skill_intimidation","label":"Intimidación","stat":"stat_cha","use":"modificador","editableBy":"dm"},{"key":"skill_performance","label":"Actuación","stat":"stat_cha","use":"modificador","editableBy":"dm"},{"key":"skill_persuasion","label":"Persuasión","stat":"stat_cha","use":"modificador","editableBy":"dm"}]}],"blocks":[{"key":"b_caps","mode":"capacidades","items":["tabla_salvaciones","tabla_habilidades"]}]},{"key":"hechizos","label":"Hechizos","items":[{"kind":"field","key":"spell_dc","label":"DC de conjuración","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"spell_attack_bonus","label":"Bono de ataque de hechizo","type":"number","editableBy":"dm","format":"signed"},{"kind":"field","key":"spell_ability","label":"Característica de lanzamiento","type":"short","editableBy":"dm"},{"kind":"table","type":"libre","key":"espacios_conjuro","label":"Espacios de conjuro","columns":[{"key":"nivel","label":"Nivel","type":"number","editableBy":"dm"},{"key":"disponibles","label":"Disponibles","type":"number","editableBy":"dm","reset":{"to":"column","column":"maximo"}},{"key":"maximo","label":"Máximo","type":"number","editableBy":"dm"}],"editableBy":"dm","sortBy":{"column":"nivel","direction":"asc"}},{"kind":"table","type":"habilidad","key":"hechizos","label":"Hechizos","columns":[{"key":"nombre","label":"Nombre","type":"short","editableBy":"player"},{"key":"categoria","label":"Categoría","type":"short","editableBy":"player"},{"key":"escuela","label":"Escuela","type":"short","editableBy":"player"},{"key":"tiempo_lanzamiento","label":"Tiempo de lanzamiento","type":"short","editableBy":"player"},{"key":"alcance","label":"Alcance","type":"short","editableBy":"player"},{"key":"componentes","label":"Componentes","type":"short","editableBy":"player"},{"key":"duracion","label":"Duración","type":"short","editableBy":"player"},{"key":"a_niveles_superiores","label":"A niveles superiores","type":"paragraph","editableBy":"player"},{"key":"concentracion","label":"Concentración","type":"boolean","editableBy":"player"},{"key":"ritual","label":"Ritual","type":"boolean","editableBy":"player"},{"key":"preparado","label":"Preparado","type":"boolean","editableBy":"player","scope":"character"}],"editableBy":"dm","categories":[{"key":"trucos","label":"Trucos"},{"key":"nivel_1","label":"Nivel 1"},{"key":"nivel_2","label":"Nivel 2"},{"key":"nivel_3","label":"Nivel 3"},{"key":"nivel_4","label":"Nivel 4"},{"key":"nivel_5","label":"Nivel 5"},{"key":"nivel_6","label":"Nivel 6"},{"key":"nivel_7","label":"Nivel 7"},{"key":"nivel_8","label":"Nivel 8"},{"key":"nivel_9","label":"Nivel 9"},{"key":"rasgos","label":"Rasgos y dotes"}]}],"blocks":[{"key":"b_casting","mode":"tile","items":["spell_dc","spell_attack_bonus","spell_ability"]},{"key":"b_slots","mode":"plano","items":["espacios_conjuro"]},{"key":"b_spells","mode":"modal","items":["hechizos"],"filterCategories":["trucos","nivel_1","nivel_2","nivel_3","nivel_4","nivel_5","nivel_6","nivel_7","nivel_8","nivel_9","rasgos"]}]}]},{"key":"equipo_rasgos","label":"Equipo y rasgos","sections":[{"key":"ataques","label":"Ataques","items":[{"kind":"table","type":"libre","key":"ataques","label":"Ataques","columns":[{"key":"nombre","label":"Arma","type":"short","editableBy":"player"},{"key":"bono_ataque","label":"Bono de ataque","type":"short","editableBy":"player"},{"key":"dano","label":"Daño","type":"short","editableBy":"player"},{"key":"tipo_dano","label":"Tipo","type":"short","editableBy":"player"},{"key":"alcance","label":"Alcance","type":"short","editableBy":"player"},{"key":"notas","label":"Notas","type":"paragraph","editableBy":"player"},{"key":"precio","label":"Precio","type":"number","editableBy":"player","default":0},{"key":"precio_moneda","label":"Moneda","type":"short","editableBy":"player","default":"gp"},{"key":"portando","label":"Portando","type":"boolean","editableBy":"player","default":true},{"key":"valor","label":"Valor","type":"number","formula":"{precio} * lookup({dinero}, \"key\", {precio_moneda}, \"value\", lookup({dinero}, \"key\", \"gp\", \"value\", 0))","editableBy":"dm"}],"editableBy":"dm"}],"blocks":[{"key":"b_attacks","mode":"plano","items":["ataques"]}]},{"key":"recursos","label":"Recursos","items":[{"kind":"table","type":"libre","key":"recursos","label":"Recursos","columns":[{"key":"nombre","label":"Nombre","type":"short","editableBy":"player"},{"key":"actual","label":"Actual","type":"number","editableBy":"player","reset":{"to":"column","column":"maximo"}},{"key":"maximo","label":"Máximo","type":"number","editableBy":"player"},{"key":"recuperacion","label":"Recuperación","type":"options","display":"select","default":"largo","editableBy":"player","options":[{"key":"largo","label":"Descanso largo"},{"key":"corto","label":"Descanso corto"}]},{"key":"notas","label":"Notas","type":"paragraph","editableBy":"player"}],"editableBy":"dm"}],"blocks":[{"key":"b_resources","mode":"plano","items":["recursos"]}]},{"key":"equipo","label":"Equipo","items":[{"kind":"table","type":"libre","key":"equipo","label":"Equipo","columns":[{"key":"nombre","label":"Nombre","type":"short","editableBy":"player"},{"key":"cantidad","label":"Cantidad","type":"number","editableBy":"player","default":1},{"key":"descripcion","label":"Descripción","type":"paragraph","editableBy":"player"},{"key":"precio","label":"Precio","type":"number","editableBy":"player","default":0},{"key":"precio_moneda","label":"Moneda","type":"short","editableBy":"player","default":"gp"},{"key":"portando","label":"Portando","type":"boolean","editableBy":"player","default":true},{"key":"valor","label":"Valor","type":"number","formula":"{precio} * {cantidad} * lookup({dinero}, \"key\", {precio_moneda}, \"value\", lookup({dinero}, \"key\", \"gp\", \"value\", 0))","editableBy":"dm"}],"editableBy":"dm"},{"kind":"table","type":"monedas","key":"dinero","label":"Dinero","rows":[{"key":"cp","label":"Cobre","value":1},{"key":"sp","label":"Plata","value":10},{"key":"ep","label":"Electrum","value":50},{"key":"gp","label":"Oro","value":100},{"key":"pp","label":"Platino","value":1000}],"rewardDestination":true},{"kind":"field","key":"valor_equipo","label":"Valor del equipo","type":"number","editableBy":"dm","hidden":true,"calc":{"table":"equipo","column":"valor","op":"suma"}},{"kind":"field","key":"valor_ataques","label":"Valor de los ataques","type":"number","editableBy":"dm","hidden":true,"calc":{"table":"ataques","column":"valor","op":"suma"}},{"kind":"field","key":"valor_inventario","label":"Valor del inventario","type":"number","editableBy":"dm","formula":"{valor_equipo} + {valor_ataques}"}],"blocks":[{"key":"b_equipment","mode":"plano","items":["equipo"]},{"key":"b_coins","mode":"plano","items":["dinero"]},{"key":"b_inventory_value","mode":"tile","items":["valor_inventario"]}]},{"key":"rasgos","label":"Rasgos","items":[{"kind":"field","key":"rasgos_clase","label":"Rasgos de clase","type":"paragraph","editableBy":"dm"},{"kind":"field","key":"otros_rasgos","label":"Otros rasgos","type":"paragraph","editableBy":"dm"},{"kind":"field","key":"idiomas","label":"Idiomas","type":"short","editableBy":"dm"},{"kind":"field","key":"prof_armas","label":"Competencia con armas","type":"short","editableBy":"dm"},{"kind":"field","key":"prof_armaduras","label":"Competencia con armaduras","type":"short","editableBy":"dm"},{"kind":"field","key":"prof_herramientas","label":"Competencia con herramientas","type":"short","editableBy":"dm"}],"blocks":[{"key":"b_traits","mode":"tile","items":["rasgos_clase","otros_rasgos","idiomas","prof_armas","prof_armaduras","prof_herramientas"]}]}]},{"key":"historia","label":"Historia","sections":[{"key":"narrativa","label":"Narrativa","items":[{"kind":"field","key":"trasfondo","label":"Trasfondo","type":"paragraph","editableBy":"player"},{"kind":"field","key":"motivo","label":"Motivo","type":"paragraph","editableBy":"player"},{"kind":"field","key":"magralita","label":"Magralita","type":"paragraph","editableBy":"dm"}],"blocks":[{"key":"b_story","mode":"tile","items":["trasfondo","motivo","magralita"]}]},{"key":"apariencia","label":"Apariencia","items":[{"kind":"field","key":"edad","label":"Edad","type":"short","editableBy":"player"},{"kind":"field","key":"altura","label":"Altura","type":"short","editableBy":"player"},{"kind":"field","key":"peso","label":"Peso","type":"short","editableBy":"player"},{"kind":"field","key":"ojos","label":"Ojos","type":"short","editableBy":"player"},{"kind":"field","key":"piel","label":"Piel","type":"short","editableBy":"player"},{"kind":"field","key":"pelo","label":"Pelo","type":"short","editableBy":"player"},{"kind":"field","key":"apariencia","label":"Apariencia","type":"paragraph","editableBy":"player"},{"kind":"field","key":"personalidad","label":"Personalidad","type":"paragraph","editableBy":"player"},{"kind":"field","key":"ideales","label":"Ideales","type":"paragraph","editableBy":"player"},{"kind":"field","key":"vinculos","label":"Vínculos","type":"paragraph","editableBy":"player"},{"kind":"field","key":"defectos","label":"Defectos","type":"paragraph","editableBy":"player"}],"blocks":[{"key":"b_looks","mode":"tile","items":["edad","altura","peso","ojos","piel","pelo"]},{"key":"b_personality","mode":"tile","items":["apariencia","personalidad","ideales","vinculos","defectos"]}]}]}],"roles":{"hp":"stat_hp","hp_current":"stat_hp_current","ac":"stat_ac","speed":"stat_speed","initiative":"stat_initiative"}}$sheet_v2$::jsonb
$$;

------------------------------------------------------------------------------
-- Small pure helpers (the same rules as whole(), text(), recoveryOption() of the TS twin)
------------------------------------------------------------------------------
-- a whole number: a JSON integer or a string holding one; anything else is null
create function public._dnd5e_v2_whole(v jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(v)
    when 'number' then case when (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric) then (v #>> '{}')::numeric end
    when 'string' then case when btrim(v #>> '{}') ~ '^-?[0-9]{1,15}$' then btrim(v #>> '{}')::numeric end
  end
$$;

-- text of a JSON string or number; '' for anything else
create function public._dnd5e_v2_text(v jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(v)
    when 'string' then v #>> '{}'
    when 'number' then trim_scale((v #>> '{}')::numeric)::text
    else ''
  end
$$;

-- 'largo' | 'corto' for "largo", "Descanso corto", ...; null for anything else
create function public._dnd5e_v2_recovery(v jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select t.t
    from (select regexp_replace(btrim(lower(v #>> '{}')), '^descanso +', '') as t where jsonb_typeof(v) = 'string') t
   where t.t in ('largo', 'corto')
$$;

------------------------------------------------------------------------------
-- Sheet: recognising the preset and adding the campaign fields
------------------------------------------------------------------------------
create function public._dnd5e_v2_strip_custom(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p -> 'categories') is distinct from 'array' then p
    else jsonb_set(p, '{categories}', (
      select coalesce(jsonb_agg(
        case when jsonb_typeof(c.v -> 'sections') = 'array'
          then jsonb_set(c.v, '{sections}', (
            select coalesce(jsonb_agg(s.v order by s.o), '[]'::jsonb)
              from jsonb_array_elements(c.v -> 'sections') with ordinality as s(v, o)
             where s.v ->> 'key' is distinct from 'campos_campana'))
          else c.v end
        order by c.o), '[]'::jsonb)
      from jsonb_array_elements(p -> 'categories') with ordinality as c(v, o)))
  end
$$;

-- 'v1' | 'v2' when the sheet is the D&D preset (with or without the campaign-fields section), else null
create function public._dnd5e_v2_sheet_kind(p jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p) is distinct from 'object' then null
    when x.s = public._dnd5e_v2_sheet_v2() then 'v2'
    when public._sheet_mark_reward_destination(x.s) = public._dnd5e_v2_sheet_v1() then 'v1'
  end
  from (select public._dnd5e_v2_strip_custom(p) as s) x
$$;

-- The sheet with the campaign fields added as paragraph fields of `campos_campana`. Returns
-- { sheet, keymap: { <custom key>: <data key> }, added, warnings }. Same rules as withCustomFields() of the TS twin.
create function public._dnd5e_v2_custom_section(p_sheet jsonb, p_fields jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_reserved text[] := array['nombre', 'jugador', 'imagen_url', 'visible_to', 'monedas', 'monedas_guardado', 'notas', 'sections_updated', 'id', 'nivel',
    'clase', 'raza', 'region', 'estado', 'owner_id', 'campaign_id', 'created_by', 'created_at', 'updated_at', 'data',
    'valor', 'modificador', 'custom_fields'];
  v_sheet jsonb := p_sheet;
  v_warn int := 0;
  v_fields jsonb := '[]'::jsonb;
  v_keymap jsonb := '{}'::jsonb;
  v_used text[];
  v_own text[] := '{}';
  v_add jsonb := '[]'::jsonb;
  v_ci int;
  v_si int;
  v_bi int;
  v_has boolean := false;
  v_home int;
  v_n int;
  f record;
  v_key text;
  v_target text;
begin
  if jsonb_typeof(p_fields) = 'array' then
    for f in select e.value as v from jsonb_array_elements(p_fields) e loop
      if jsonb_typeof(f.v) = 'object' and jsonb_typeof(f.v -> 'key') = 'string' and (f.v ->> 'key') ~ '^[a-z][a-z0-9_]{0,39}$'
         and strpos(f.v ->> 'key', '__') = 0 and jsonb_typeof(f.v -> 'label') = 'string' then
        if not exists (select 1 from jsonb_array_elements(v_fields) o where o ->> 'key' = f.v ->> 'key') then
          v_fields := v_fields || jsonb_build_array(jsonb_build_object('key', f.v ->> 'key', 'label', f.v ->> 'label'));
        end if;
      else
        v_warn := v_warn + 1;
      end if;
    end loop;
  end if;
  if jsonb_array_length(v_fields) = 0 or jsonb_typeof(v_sheet -> 'categories') is distinct from 'array' or jsonb_array_length(v_sheet -> 'categories') = 0 then
    return jsonb_build_object('sheet', v_sheet, 'keymap', v_keymap, 'added', 0, 'warnings', v_warn);
  end if;

  -- where the section is today, and which keys the rest of the sheet uses
  v_used := v_reserved;
  for v_ci in 0 .. jsonb_array_length(v_sheet -> 'categories') - 1 loop
    if jsonb_typeof(v_sheet -> 'categories' -> v_ci -> 'sections') = 'array' then
      for v_si in 0 .. jsonb_array_length(v_sheet -> 'categories' -> v_ci -> 'sections') - 1 loop
        if v_sheet -> 'categories' -> v_ci -> 'sections' -> v_si ->> 'key' = 'campos_campana' then
          v_has := true;
          v_home := v_ci;
          v_n := v_si;
          select coalesce(array_agg(i ->> 'key'), '{}') into v_own from jsonb_array_elements(coalesce(v_sheet -> 'categories' -> v_ci -> 'sections' -> v_si -> 'items', '[]'::jsonb)) i;
        elsif jsonb_typeof(v_sheet -> 'categories' -> v_ci -> 'sections' -> v_si -> 'items') = 'array' then
          select v_used || coalesce(array_agg(i ->> 'key'), '{}') into v_used from jsonb_array_elements(v_sheet -> 'categories' -> v_ci -> 'sections' -> v_si -> 'items') i;
        end if;
      end loop;
    end if;
  end loop;

  for f in select e.value as v from jsonb_array_elements(v_fields) e loop
    v_key := f.v ->> 'key';
    v_target := v_key;
    if v_target = any (v_used) then
      v_target := left('campo_' || v_key, 40);
      v_warn := v_warn + 1;
    end if;
    if v_target = any (v_used) or v_target !~ '^[a-z][a-z0-9_]{0,39}$' then
      v_warn := v_warn + 1;
      continue;
    end if;
    v_used := v_used || v_target;
    v_keymap := v_keymap || jsonb_build_object(v_key, v_target);
    if not (v_target = any (v_own)) then
      v_own := v_own || v_target;
      v_add := v_add || jsonb_build_array(jsonb_build_object('kind', 'field', 'key', v_target,
        'label', coalesce(nullif(left(btrim(f.v ->> 'label'), 60), ''), v_key), 'type', 'paragraph', 'editableBy', 'dm'));
    end if;
  end loop;
  if jsonb_array_length(v_add) = 0 then
    return jsonb_build_object('sheet', v_sheet, 'keymap', v_keymap, 'added', 0, 'warnings', v_warn);
  end if;

  if v_has then
    v_ci := v_home;
    v_si := v_n;
    v_sheet := jsonb_set(v_sheet, array['categories', v_ci::text, 'sections', v_si::text, 'items'],
      coalesce(v_sheet -> 'categories' -> v_ci -> 'sections' -> v_si -> 'items', '[]'::jsonb) || v_add);
    v_bi := null;
    if jsonb_typeof(v_sheet -> 'categories' -> v_ci -> 'sections' -> v_si -> 'blocks') = 'array' then
      select o - 1 into v_bi from jsonb_array_elements(v_sheet -> 'categories' -> v_ci -> 'sections' -> v_si -> 'blocks') with ordinality b(v, o)
       where b.v ->> 'key' = 'b_campos_campana' limit 1;
    end if;
    if v_bi is not null then
      v_sheet := jsonb_set(v_sheet, array['categories', v_ci::text, 'sections', v_si::text, 'blocks', v_bi::text, 'items'],
        (v_sheet -> 'categories' -> v_ci -> 'sections' -> v_si -> 'blocks' -> v_bi -> 'items') || (select jsonb_agg(a -> 'key') from jsonb_array_elements(v_add) a));
    else
      v_sheet := jsonb_set(v_sheet, array['categories', v_ci::text, 'sections', v_si::text, 'blocks'],
        coalesce(v_sheet -> 'categories' -> v_ci -> 'sections' -> v_si -> 'blocks', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object('key', 'b_campos_campana', 'mode', 'tile', 'items', (select jsonb_agg(a -> 'key') from jsonb_array_elements(v_add) a))));
    end if;
  else
    select o - 1 into v_home from jsonb_array_elements(v_sheet -> 'categories') with ordinality c(v, o) where c.v ->> 'key' = 'historia' limit 1;
    v_home := coalesce(v_home, jsonb_array_length(v_sheet -> 'categories') - 1);
    v_sheet := jsonb_set(v_sheet, array['categories', v_home::text, 'sections'],
      coalesce(v_sheet -> 'categories' -> v_home -> 'sections', '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('key', 'campos_campana', 'label', 'Campos de la campaña', 'items', v_add,
           'blocks', jsonb_build_array(jsonb_build_object('key', 'b_campos_campana', 'mode', 'tile', 'items', (select jsonb_agg(a -> 'key') from jsonb_array_elements(v_add) a))))));
  end if;
  return jsonb_build_object('sheet', v_sheet, 'keymap', v_keymap, 'added', jsonb_array_length(v_add), 'warnings', v_warn);
end;
$$;

------------------------------------------------------------------------------
-- Character data (everything except hechizos rows, which become entries; the key itself is removed here)
------------------------------------------------------------------------------
-- Returns { data, removed: [keys], warnings: n }. p_keymap is the custom key -> data key map of the campaign.
create function public._dnd5e_v2_pj_data(p_data jsonb, p_nivel integer, p_keymap jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := p_data;
  v_removed jsonb := '[]'::jsonb;
  v_warn int := 0;
  r record;
  v_num numeric;
  v_raw jsonb;
  v_s text;
  m text[];
  v_max jsonb;
  v_cur jsonb;
  v_bad int;
  v_slots jsonb;
  v_arr jsonb;
  v_row jsonb;
  v_opt text;
  v_rest jsonb;
  v_value text;
  v_prior jsonb;
begin
  -- skills: numbers 0/1/2 -> option keys
  for r in select e.key as k, e.value as val from jsonb_each(p_data) e where e.key like 'skill\_%' loop
    v_num := case when jsonb_typeof(r.val) = 'number' then (r.val #>> '{}')::numeric end;
    if v_num in (0, 1, 2) then
      v := jsonb_set(v, array[r.k], to_jsonb(case v_num when 0 then 'no'::text when 1 then 'competente'::text else 'experto'::text end));
    elsif jsonb_typeof(r.val) = 'null' or (jsonb_typeof(r.val) = 'string' and (r.val #>> '{}') in ('no', 'competente', 'experto')) then
      null;
    else
      v_warn := v_warn + 1;
    end if;
  end loop;

  -- hit dice
  if p_data ? 'stat_hit_dice' then
    v_raw := p_data -> 'stat_hit_dice';
    v := v - 'stat_hit_dice';
    v_removed := v_removed || to_jsonb('stat_hit_dice'::text);
    if jsonb_typeof(v_raw) = 'string' then
      v_s := v_raw #>> '{}';
      if btrim(v_s) <> '' then
        m := regexp_match(btrim(lower(v_s)), '^([0-9]{1,6}d[0-9]{1,6})(?:[ \t]*\([ \t]*([0-9]{1,9})[ \t]*/[ \t]*([0-9]{1,9})[ \t]*\))?$');
        if m is not null then
          if not (p_data ? 'dado_golpe') then
            v := v || jsonb_build_object('dado_golpe', m[1]);
          end if;
          if not (p_data ? 'dados_disponibles') then
            if m[2] is not null then
              v := v || jsonb_build_object('dados_disponibles', m[2]::numeric);
            elsif p_nivel is not null then
              v := v || jsonb_build_object('dados_disponibles', p_nivel);
            else
              v_warn := v_warn + 1;
            end if;
          end if;
        else
          v_warn := v_warn + 1;
          if not (p_data ? 'dado_golpe') then
            v := v || jsonb_build_object('dado_golpe', v_s);
          end if;
        end if;
      end if;
    elsif jsonb_typeof(v_raw) <> 'null' then
      v_warn := v_warn + 1;
    end if;
  end if;

  -- spell slots -> espacios_conjuro rows
  if p_data ? 'spell_slots' or p_data ? 'spell_slots_current' then
    v_max := case when jsonb_typeof(p_data -> 'spell_slots') = 'object' then p_data -> 'spell_slots' else '{}'::jsonb end;
    v_cur := case when jsonb_typeof(p_data -> 'spell_slots_current') = 'object' then p_data -> 'spell_slots_current' else '{}'::jsonb end;
    with s as (
      select e.key as k,
             case when e.key ~ '^[0-9]{1,3}$' then e.key::int end as nivel,
             public._dnd5e_v2_whole(e.value) as maximo,
             case when v_cur ? e.key then public._dnd5e_v2_whole(v_cur -> e.key) else public._dnd5e_v2_whole(e.value) end as cur
        from jsonb_each(v_max) e
    ), good as (
      select row_number() over (order by s.nivel, s.k) as rn, s.nivel, s.maximo, coalesce(s.cur, s.maximo) as disp
        from s where s.nivel is not null and s.maximo is not null and s.maximo > 0
    )
    select (select count(*) from s where s.nivel is null or s.maximo is null),
           (select jsonb_agg(jsonb_build_object('id', g.rn, 'nivel', g.nivel, 'disponibles', g.disp, 'maximo', g.maximo) order by g.rn) from good g)
      into v_bad, v_slots;
    v_warn := v_warn + v_bad;
    if v_slots is not null then
      if jsonb_typeof(p_data -> 'espacios_conjuro') = 'array' and jsonb_array_length(p_data -> 'espacios_conjuro') > 0 then
        v_warn := v_warn + 1;
      else
        v := v || jsonb_build_object('espacios_conjuro', v_slots);
      end if;
    end if;
    if p_data ? 'spell_slots' then
      v := v - 'spell_slots';
      v_removed := v_removed || to_jsonb('spell_slots'::text);
    end if;
    if p_data ? 'spell_slots_current' then
      v := v - 'spell_slots_current';
      v_removed := v_removed || to_jsonb('spell_slots_current'::text);
    end if;
  end if;

  -- resources: recuperacion text -> option key
  if jsonb_typeof(p_data -> 'recursos') = 'array' then
    v_arr := '[]'::jsonb;
    for r in select e.value as val from jsonb_array_elements(p_data -> 'recursos') e loop
      v_row := r.val;
      if jsonb_typeof(r.val) = 'object' and r.val ? 'recuperacion' and r.val -> 'recuperacion' not in ('"largo"'::jsonb, '"corto"'::jsonb) then
        v_opt := public._dnd5e_v2_recovery(r.val -> 'recuperacion');
        if v_opt is null then
          v_opt := 'largo';
          if not (jsonb_typeof(r.val -> 'recuperacion') = 'null' or (jsonb_typeof(r.val -> 'recuperacion') = 'string' and btrim(r.val ->> 'recuperacion') = '')) then
            v_warn := v_warn + 1;
          end if;
        end if;
        v_row := jsonb_set(r.val, '{recuperacion}', to_jsonb(v_opt));
      end if;
      v_arr := v_arr || jsonb_build_array(v_row);
    end loop;
    v := jsonb_set(v, '{recursos}', v_arr);
  end if;

  -- campaign custom fields: data.custom_fields.<k> -> data.<target>
  if jsonb_typeof(p_keymap) = 'object' and p_keymap <> '{}'::jsonb and jsonb_typeof(p_data -> 'custom_fields') = 'object' then
    v_rest := p_data -> 'custom_fields';
    for r in select e.key as k, e.value as target from jsonb_each(p_keymap) e order by e.key loop
      if not (v_rest ? r.k) then
        continue;
      end if;
      v_raw := v_rest -> r.k;
      v_value := case jsonb_typeof(v_raw) when 'string' then v_raw #>> '{}' when 'number' then public._dnd5e_v2_text(v_raw) when 'boolean' then v_raw #>> '{}' end;
      if v_value is null then
        if jsonb_typeof(v_raw) = 'null' then
          v_rest := v_rest - r.k;
        else
          v_warn := v_warn + 1;
        end if;
        continue;
      end if;
      if v_value <> '' then
        v_prior := p_data -> (r.target #>> '{}');
        if jsonb_typeof(v_prior) = 'string' and (v_prior #>> '{}') <> '' and (v_prior #>> '{}') <> v_value then
          v_warn := v_warn + 1;
        end if;
        v := jsonb_set(v, array[r.target #>> '{}'], to_jsonb(v_value));
      end if;
      v_rest := v_rest - r.k;
    end loop;
    if v_rest = '{}'::jsonb then
      v := v - 'custom_fields';
      v_removed := v_removed || to_jsonb('custom_fields'::text);
    else
      v := jsonb_set(v, '{custom_fields}', v_rest);
      v_warn := v_warn + 1;
    end if;
  end if;

  -- spells become entries (campaign level); the rows leave the character
  if p_data ? 'hechizos' then
    if jsonb_typeof(p_data -> 'hechizos') not in ('array', 'null') then
      v_warn := v_warn + 1;
    end if;
    v := v - 'hechizos';
    v_removed := v_removed || to_jsonb('hechizos'::text);
  end if;

  return jsonb_build_object('data', v, 'removed', v_removed, 'warnings', v_warn);
end;
$$;

------------------------------------------------------------------------------
-- Spells: normalised rows of one character, and the S39 entries of a whole campaign
------------------------------------------------------------------------------
-- One row per hechizos element. problem: row_invalid | name_missing | duplicate (a repeated category + name inside the character,
-- the first one wins) | null; nivel_fallback: the level was unreadable (category rasgos); truncated: a value was cut to the entry limit;
-- dropped: the row had keys that no entry column holds.
create function public._dnd5e_v2_spell_rows(p_pj bigint, p_rows jsonb)
returns table (pj_id bigint, ord int, category text, name text, description text, extras jsonb, preparado boolean,
               problem text, nivel_fallback boolean, truncated boolean, dropped boolean)
language sql
immutable
set search_path = ''
as $$
  with r as (
    select e.ordinality::int as ord, e.value as v
      from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) with ordinality as e
  ), n as (
    select r.ord, case when jsonb_typeof(r.v) = 'object' then r.v end as vo,
           btrim(left(btrim(public._dnd5e_v2_text(r.v -> 'nombre')), 200)) as nm,
           public._dnd5e_v2_whole(r.v -> 'nivel') as lvl
      from r
  ), c as (
    select n.ord, n.vo, n.nm,
           case when n.lvl = 0 then 'trucos' when n.lvl between 1 and 9 then 'nivel_' || n.lvl::int::text when n.lvl = 10 then 'rasgos' end as cat0,
           public._dnd5e_v2_text(n.vo -> 'escuela') as t_escuela,
           public._dnd5e_v2_text(case when n.vo ? 'casting_time' then n.vo -> 'casting_time' else n.vo -> 'tiempo_lanzamiento' end) as t_tiempo,
           public._dnd5e_v2_text(n.vo -> 'alcance') as t_alcance,
           public._dnd5e_v2_text(n.vo -> 'componentes') as t_componentes,
           public._dnd5e_v2_text(n.vo -> 'duracion') as t_duracion,
           public._dnd5e_v2_text(n.vo -> 'a_niveles_superiores') as t_superiores,
           public._dnd5e_v2_text(n.vo -> 'descripcion') as t_descripcion
      from n
  ), y as (
    select c.*, coalesce(c.cat0, 'rasgos') as cat,
           case when c.vo is null then 'row_invalid' when c.nm = '' then 'name_missing' end as p0
      from c
  ), z as (
    select y.*, row_number() over (partition by (y.p0 is null), y.cat, lower(y.nm) order by y.ord) as rn from y
  )
  select p_pj, z.ord, z.cat, z.nm, left(z.t_descripcion, 20000),
         jsonb_strip_nulls(jsonb_build_object(
           'escuela', nullif(left(z.t_escuela, 500), ''),
           'tiempo_lanzamiento', nullif(left(z.t_tiempo, 500), ''),
           'alcance', nullif(left(z.t_alcance, 500), ''),
           'componentes', nullif(left(z.t_componentes, 500), ''),
           'duracion', nullif(left(z.t_duracion, 500), ''),
           'a_niveles_superiores', nullif(left(z.t_superiores, 20000), ''),
           'concentracion', case when z.vo -> 'concentracion' = 'true'::jsonb then true end,
           'ritual', case when z.vo -> 'ritual' = 'true'::jsonb then true end)),
         coalesce(z.vo -> 'preparado' = 'true'::jsonb, false),
         coalesce(z.p0, case when z.rn > 1 then 'duplicate' end),
         z.cat0 is null,
         greatest(char_length(z.t_escuela), char_length(z.t_tiempo), char_length(z.t_alcance), char_length(z.t_componentes), char_length(z.t_duracion)) > 500
           or char_length(z.t_superiores) > 20000 or char_length(z.t_descripcion) > 20000,
         coalesce(exists (select 1 from jsonb_object_keys(z.vo) k
                           where k <> all (array['id', 'nombre', 'nivel', 'preparado', 'descripcion', 'casting_time', 'tiempo_lanzamiento', 'escuela', 'alcance',
                                                  'componentes', 'duracion', 'a_niveles_superiores', 'concentracion', 'ritual'])), false)
    from z
   order by z.ord
$$;

-- S39 over the normalised rows [{ pj_id, category, name, description, extras, preparado }] of a campaign: private is true when the
-- same category + lower(name) is held by several characters with different content (name, description, extras)
create function public._dnd5e_v2_spell_entries(p_rows jsonb)
returns table (pj_id bigint, category text, name text, description text, extras jsonb, preparado boolean, private boolean)
language sql
immutable
set search_path = ''
as $$
  with s as (
    select * from jsonb_to_recordset(p_rows) as x(pj_id bigint, category text, name text, description text, extras jsonb, preparado boolean)
  ), g as (
    select s.category, lower(s.name) as lname, count(*) as holders, count(distinct jsonb_build_array(s.name, s.description, s.extras)) as contents
      from s group by 1, 2
  )
  select s.pj_id, s.category, s.name, s.description, s.extras, s.preparado, g.holders > 1 and g.contents > 1
    from s join g on g.category = s.category and g.lname = lower(s.name)
$$;

------------------------------------------------------------------------------
-- One campaign. Returns counts (never text); null when the sheet is not the preset.
------------------------------------------------------------------------------
create function public._dnd5e_v2_migrate_campaign(p_campaign uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_profile jsonb;
  v_fields jsonb;
  v_kind text;
  v_base jsonb;
  v_custom jsonb;
  v_sheet jsonb;
  v_keymap jsonb;
  v_plan jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_res jsonb;
  v_spells jsonb;
  v_warn int := 0;
  v_changed int := 0;
  v_problem int := 0;
  v_ids bigint[] := '{}';
  v_links jsonb := '[]'::jsonb;
  v_entries int;
  v_new_ids bigint[];
  v_new_links jsonb;
  v_sheet_changed boolean;
  p record;
begin
  select c.system_profile, c.character_custom_fields into v_profile, v_fields
    from public.campaigns c where c.id = p_campaign for update;
  if not found then
    return null;
  end if;
  v_kind := public._dnd5e_v2_sheet_kind(v_profile -> 'sheet');
  if v_kind is null then
    raise notice 'dnd5e_v2: campaign % has a custom sheet, left alone', p_campaign;
    return null;
  end if;

  -- the new sheet: v1 -> v2, plus the campaign fields
  v_base := case v_kind when 'v1' then public._dnd5e_v2_sheet_v2() else v_profile -> 'sheet' end;
  v_custom := public._dnd5e_v2_custom_section(v_base, v_fields);
  v_sheet := v_custom -> 'sheet';
  v_keymap := v_custom -> 'keymap';
  v_warn := (v_custom ->> 'warnings')::int;
  v_sheet_changed := v_sheet is distinct from v_profile -> 'sheet';
  if v_sheet_changed then
    perform public.validate_sheet(v_sheet); -- a sheet the validators refuse aborts the whole migration
  end if;

  -- plan every character first, so the backup can be written before anything changes
  for p in
    select pj.id, pj.nivel, pj.data, pj.jugador, coalesce(pr.display_name, '') as owner_name
      from public.pjs pj left join public.profiles pr on pr.id = pj.owner_id
     where pj.campaign_id = p_campaign order by pj.id
  loop
    v_res := public._dnd5e_v2_pj_data(p.data, p.nivel, v_keymap);
    v_warn := v_warn + (v_res ->> 'warnings')::int;
    if jsonb_typeof(p.data -> 'hechizos') = 'array' then
      select coalesce(jsonb_agg(jsonb_build_object('pj_id', s.pj_id, 'category', s.category, 'name', s.name, 'description', s.description,
                                                   'extras', s.extras, 'preparado', s.preparado) order by s.ord) filter (where s.problem is null), '[]'::jsonb),
             count(*) filter (where s.problem is not null) + count(*) filter (where s.problem is null and (s.nivel_fallback or s.truncated or s.dropped))
        into v_spells, v_problem
        from public._dnd5e_v2_spell_rows(p.id, p.data -> 'hechizos') s;
      v_rows := v_rows || v_spells;
      v_warn := v_warn + v_problem;
    end if;
    if (v_res -> 'data') is distinct from p.data or p.owner_name is distinct from coalesce(p.jugador, '') then
      v_plan := v_plan || jsonb_build_array(jsonb_build_object('id', p.id, 'data', v_res -> 'data', 'jugador', p.owner_name,
                                                                'old_data', p.data, 'old_jugador', p.jugador));
    end if;
  end loop;

  -- 1. backup, 2. sheet, 3. characters
  if v_sheet_changed or jsonb_array_length(v_rows) > 0 then
    insert into public.migration_backup_dnd5e_v2 (pj_id, campaign_id, old_sheet)
    select null, p_campaign, v_profile -> 'sheet'
     where not exists (select 1 from public.migration_backup_dnd5e_v2 b where b.pj_id is null and b.campaign_id = p_campaign);
  end if;
  insert into public.migration_backup_dnd5e_v2 (pj_id, campaign_id, old_data, old_jugador)
  select (x ->> 'id')::bigint, p_campaign, x -> 'old_data', x ->> 'old_jugador'
    from jsonb_array_elements(v_plan) x
   where not exists (select 1 from public.migration_backup_dnd5e_v2 b where b.pj_id = (x ->> 'id')::bigint);

  if v_sheet_changed then
    update public.campaigns set system_profile = jsonb_set(system_profile, '{sheet}', v_sheet) where id = p_campaign;
  end if;
  update public.pjs pj set data = x.data, jugador = x.jugador
    from jsonb_to_recordset(v_plan) as x(id bigint, data jsonb, jugador text)
   where pj.id = x.id and pj.campaign_id = p_campaign;
  v_changed := jsonb_array_length(v_plan);

  -- 4. entries and links (S39)
  if jsonb_array_length(v_rows) > 0 then
    with e as (select * from public._dnd5e_v2_spell_entries(v_rows)),
    pick as (
      (select distinct on (e.category, lower(e.name)) e.category, e.name, e.description, e.extras, null::bigint as owner
         from e where not e.private order by e.category, lower(e.name), e.pj_id)
      union all
      select e.category, e.name, e.description, e.extras, e.pj_id from e where e.private
    ), ins as (
      insert into public.campaign_actions (campaign_id, table_key, category, name, description, extras, private_to_pj)
      select p_campaign, 'hechizos', k.category, k.name, k.description, k.extras, k.owner from pick k
      on conflict do nothing
      returning id
    )
    select coalesce(array_agg(ins.id), '{}'), (select count(*) from pick) into v_new_ids, v_entries from ins;
    with e as (select * from public._dnd5e_v2_spell_entries(v_rows)),
    ins as (
      insert into public.pj_action_links (pj_id, action_id, campaign_id, state)
      select e.pj_id, a.id, p_campaign, jsonb_build_object('preparado', e.preparado)
        from e join public.campaign_actions a
          on a.campaign_id = p_campaign and a.table_key = 'hechizos' and a.category = e.category
         and lower(btrim(a.name)) = lower(e.name) and coalesce(a.private_to_pj, 0) = case when e.private then e.pj_id else 0 end
      on conflict do nothing
      returning pj_id, action_id
    )
    select coalesce(jsonb_agg(jsonb_build_array(ins.pj_id, ins.action_id)), '[]'::jsonb) into v_new_links from ins;
    update public.migration_backup_dnd5e_v2 b
       set inserted_action_ids = b.inserted_action_ids || v_new_ids, inserted_links = b.inserted_links || v_new_links
     where b.pj_id is null and b.campaign_id = p_campaign;
  else
    v_new_ids := '{}';
    v_new_links := '[]'::jsonb;
    v_entries := 0;
  end if;

  return jsonb_build_object(
    'kind', v_kind,
    'sheet_changed', v_sheet_changed,
    'pjs_changed', v_changed,
    'entries_created', coalesce(array_length(v_new_ids, 1), 0),
    'entries_reused', v_entries - coalesce(array_length(v_new_ids, 1), 0),
    'links_created', jsonb_array_length(v_new_links),
    'warnings', v_warn);
end;
$$;

revoke execute on function
  public._dnd5e_v2_sheet_v1(), public._dnd5e_v2_sheet_v2(), public._dnd5e_v2_whole(jsonb), public._dnd5e_v2_text(jsonb),
  public._dnd5e_v2_recovery(jsonb), public._dnd5e_v2_strip_custom(jsonb), public._dnd5e_v2_sheet_kind(jsonb),
  public._dnd5e_v2_custom_section(jsonb, jsonb), public._dnd5e_v2_pj_data(jsonb, integer, jsonb),
  public._dnd5e_v2_spell_rows(bigint, jsonb), public._dnd5e_v2_spell_entries(jsonb), public._dnd5e_v2_migrate_campaign(uuid)
  from public, anon, authenticated;

------------------------------------------------------------------------------
-- Run it (counts only)
------------------------------------------------------------------------------
do $run$
declare
  c record;
  r jsonb;
begin
  for c in select id from public.campaigns order by created_at, id loop
    r := public._dnd5e_v2_migrate_campaign(c.id);
    if r is not null then
      raise notice 'dnd5e_v2: campaign % %', c.id, r;
    end if;
  end loop;
end;
$run$;
