-- G5b of the system-agnostic campaigns (odd/tasks/system-agnostic.md, S12, S14, S28, S16). Coins credited outside the sheet
-- (lottery prize, pot payout) go to the REWARD DESTINATION of the campaign sheet:
--   * the coin table marked `rewardDestination`  -> pjs.monedas  (merged per denomination, other keys kept);
--   * an economy table marked `rewardDestination` -> pjs.data[<table key>]  (merged per denomination, other entries kept).
-- The denominations are the rows of the sheet coin table, in schema order. Amounts are strict in sheet mode: only denominations,
-- non-negative whole numbers up to 1e15; anything else raises `invalid_coins` (a ZERO for a key that is not a denomination loses
-- nothing and is tolerated, so a seeded config with {cp,sp,ep,gp,pp: 0} still reads on a custom sheet).
--
-- Which mode a campaign is in (public._reward_target):
--   legacy  no stored sheet, or a sheet without a coin table: exactly the behaviour of 20261006120200 (keys cp..pp, silent
--           coercion, pjs.monedas, section 'equipo').
--   sheet   a coin table with denominations AND a table marked as destination.
--   none    a coin table without denominations, or without any destination: every credit and the lottery raise
--           `no_reward_destination`; nothing is written (the lottery is hidden by the client).
-- The pot (game_pot) has FIXED columns cp/sp/ep/gp/pp: on a sheet whose denominations are not all among them, the pot paths
-- (DM lottery roll, assign_pot_to_character) raise `pot_denominations_unsupported` (a later task can add jsonb pot amounts).
--
-- Stored data (S28 literal rule): the D&D preset now marks its coin table as destination. This migration
--   1. restates the column default of campaigns.system_profile with the flagged preset (a database that applied
--      20261028130000 BEFORE it was regenerated keeps the old default otherwise),
--   2. backfills every stored sheet that has a coin table and no destination at all (sets rewardDestination on that table only).
--
-- Rollback (manual, not part of the migration): restore the three functions from 20261006120200 (create or replace), then
--   update public.campaigns set system_profile = jsonb_set(system_profile, '{sheet}', <sheet without the rewardDestination key
--   on its coin table>) for the campaigns that were backfilled (they are the ones whose coin table is the destination and that
--   never had an economy table), set the column default back to the literal of 20261028130000 without the flag, then
--   drop function public._reward_target(uuid), public._reward_normalize(jsonb, jsonb), public._sheet_mark_reward_destination(jsonb).

------------------------------------------------------------------------------
-- The backfill helper: pure, returns the sheet with the destination marked when there is none
------------------------------------------------------------------------------
create function public._sheet_mark_reward_destination(p_sheet jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_sheet) is distinct from 'object' then p_sheet
    when not jsonb_path_exists(p_sheet, '$.categories[*].sections[*].items[*] ? (@.kind == "table" && @.type == "monedas")') then p_sheet
    when jsonb_path_exists(p_sheet, '$.categories[*].sections[*].items[*] ? (@.rewardDestination == true)') then p_sheet
    else jsonb_set(p_sheet, '{categories}', (
      select coalesce(jsonb_agg(
        jsonb_set(cat.v, '{sections}', (
          select coalesce(jsonb_agg(
            jsonb_set(sec.v, '{items}', (
              select coalesce(jsonb_agg(
                case when it.v ->> 'kind' = 'table' and it.v ->> 'type' = 'monedas' then it.v || '{"rewardDestination": true}'::jsonb else it.v end
                order by it.o), '[]'::jsonb)
              from jsonb_array_elements(coalesce(sec.v -> 'items', '[]'::jsonb)) with ordinality as it(v, o)))
            order by sec.o), '[]'::jsonb)
          from jsonb_array_elements(coalesce(cat.v -> 'sections', '[]'::jsonb)) with ordinality as sec(v, o)))
        order by cat.o), '[]'::jsonb)
      from jsonb_array_elements(p_sheet -> 'categories') with ordinality as cat(v, o)))
  end;
$$;

revoke execute on function public._sheet_mark_reward_destination(jsonb) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Default for new campaigns: the D&D preset with its coin table marked as destination
------------------------------------------------------------------------------
alter table public.campaigns
  alter column system_profile set default $profile${
    "version": 1,
    "character": {
      "builtins": {
        "clase": {"enabled": true, "label": "Clase"},
        "raza": {"enabled": true, "label": "Raza"},
        "nivel": {"enabled": true, "label": "Nivel", "min": 1, "max": 20}
      },
      "sections": {
        "stats": true, "habilidades": true, "ataques": true, "hechizos": true, "recursos": true,
        "equipo": true, "rasgos": true, "narrativa": true, "apariencia": true
      }
    },
    "currency": {
      "enabled": true,
      "denominations": [
        {"key": "pp", "label": "platino"},
        {"key": "gp", "label": "oro"},
        {"key": "ep", "label": "electrum"},
        {"key": "sp", "label": "plata"},
        {"key": "cp", "label": "bronce"}
      ]
    },
    "modules": {"juegos": true, "sesion_en_vivo": true, "mapas": true, "calendario": true}
  }$profile$::jsonb
    || jsonb_build_object('sheet', $dnd5e_sheet${"categories":[{"key":"identidad_dnd","label":"Identidad D&D","sections":[{"key":"general","label":"General","items":[{"kind":"field","key":"trasfondo_dnd","label":"Trasfondo D&D","type":"short","editableBy":"player"},{"kind":"field","key":"alineamiento","label":"Alineamiento","type":"short","editableBy":"player"},{"kind":"field","key":"experiencia","label":"Experiencia (XP)","type":"number","editableBy":"dm","min":0}],"blocks":[{"key":"b_general","mode":"tile","items":["trasfondo_dnd","alineamiento","experiencia"]}]}]},{"key":"mecanicas","label":"Mecánicas","sections":[{"key":"stats","label":"Atributos y combate","items":[{"kind":"table","type":"stat","key":"tabla_stats","label":"Atributos","rows":[{"key":"stat_str","label":"FUE","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_dex","label":"DES","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_con","label":"CON","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_int","label":"INT","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_wis","label":"SAB","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"},{"key":"stat_cha","label":"CAR","modifier":"floor(({valor} - 10) / 2)","editableBy":"dm"}]},{"kind":"field","key":"dado_golpe","label":"Dado de golpe","type":"short","editableBy":"dm","default":""},{"kind":"field","key":"dados_disponibles","label":"Dados de golpe disponibles","type":"number","editableBy":"dm","min":0,"default":0},{"kind":"field","key":"stat_hp","label":"HP máx.","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_hp_current","label":"HP actual","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_hp_temp","label":"HP temporal","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_ac","label":"AC","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_ac_temp","label":"AC temporal","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_speed","label":"Velocidad (ft)","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"stat_initiative","label":"Iniciativa","type":"number","editableBy":"dm","format":"signed"},{"kind":"field","key":"stat_hit_dice","label":"Dados de golpe","type":"short","editableBy":"dm","formula":"{dado_golpe} & \" (\" & {dados_disponibles} & \"/\" & {nivel} & \")\""},{"kind":"field","key":"stat_inspiration","label":"Inspiración","type":"boolean","editableBy":"dm"},{"kind":"field","key":"stat_proficiency_bonus","label":"Bono de competencia","type":"number","editableBy":"dm","formula":"2 + floor(({nivel} - 1) / 4)","overridable":true,"format":"signed"},{"kind":"field","key":"stat_death_saves_success","label":"Salvaciones de muerte: éxitos","type":"number","editableBy":"dm","min":0,"max":3},{"kind":"field","key":"stat_death_saves_failure","label":"Salvaciones de muerte: fallos","type":"number","editableBy":"dm","min":0,"max":3},{"kind":"field","key":"percepcion_pasiva","label":"Percepción pasiva","type":"number","editableBy":"dm","formula":"10 + {skill_perception}"}],"blocks":[{"key":"b_stats","mode":"stat","items":["tabla_stats"]},{"key":"b_vitals","title":"Combate","mode":"tile","items":["stat_hp","stat_hp_current","stat_hp_temp","stat_ac","stat_ac_temp","stat_speed","stat_initiative","stat_hit_dice","stat_inspiration","stat_proficiency_bonus","stat_death_saves_success","stat_death_saves_failure","percepcion_pasiva"]}]},{"key":"habilidades","label":"Salvaciones y habilidades","items":[{"kind":"table","type":"capacidades","key":"tabla_salvaciones","label":"Salvaciones","columns":[{"key":"competente","label":"Competente","type":"boolean","editableBy":"dm","default":false},{"key":"bono","label":"Bono","type":"number","formula":"{modificador} + si({competente}, {stat_proficiency_bonus}, 0)","format":"signed","editableBy":"dm"}],"rows":[{"key":"save_str","label":"Salvación","stat":"stat_str","use":"modificador","editableBy":"dm"},{"key":"save_dex","label":"Salvación","stat":"stat_dex","use":"modificador","editableBy":"dm"},{"key":"save_con","label":"Salvación","stat":"stat_con","use":"modificador","editableBy":"dm"},{"key":"save_int","label":"Salvación","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"save_wis","label":"Salvación","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"save_cha","label":"Salvación","stat":"stat_cha","use":"modificador","editableBy":"dm"}]},{"kind":"table","type":"capacidades","key":"tabla_habilidades","label":"Habilidades","columns":[{"key":"competencia","label":"Competencia","type":"options","display":"select","format":"signed","default":"no","editableBy":"dm","options":[{"key":"no","label":"No competente","formula":"{modificador}"},{"key":"competente","label":"Competente","formula":"{modificador} + {stat_proficiency_bonus}"},{"key":"experto","label":"Experto","formula":"{modificador} + {stat_proficiency_bonus} * 2"}]}],"rows":[{"key":"skill_athletics","label":"Atletismo","stat":"stat_str","use":"modificador","editableBy":"dm"},{"key":"skill_acrobatics","label":"Acrobacias","stat":"stat_dex","use":"modificador","editableBy":"dm"},{"key":"skill_sleight_of_hand","label":"Juego de Manos","stat":"stat_dex","use":"modificador","editableBy":"dm"},{"key":"skill_stealth","label":"Sigilo","stat":"stat_dex","use":"modificador","editableBy":"dm"},{"key":"skill_arcana","label":"Arcanismo","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_history","label":"Historia","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_investigation","label":"Investigación","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_nature","label":"Naturaleza","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_religion","label":"Religión","stat":"stat_int","use":"modificador","editableBy":"dm"},{"key":"skill_animal_handling","label":"Trato Animal","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_insight","label":"Perspicacia","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_medicine","label":"Medicina","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_perception","label":"Percepción","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_survival","label":"Supervivencia","stat":"stat_wis","use":"modificador","editableBy":"dm"},{"key":"skill_deception","label":"Engaño","stat":"stat_cha","use":"modificador","editableBy":"dm"},{"key":"skill_intimidation","label":"Intimidación","stat":"stat_cha","use":"modificador","editableBy":"dm"},{"key":"skill_performance","label":"Actuación","stat":"stat_cha","use":"modificador","editableBy":"dm"},{"key":"skill_persuasion","label":"Persuasión","stat":"stat_cha","use":"modificador","editableBy":"dm"}]}],"blocks":[{"key":"b_caps","mode":"capacidades","items":["tabla_salvaciones","tabla_habilidades"]}]},{"key":"hechizos","label":"Hechizos","items":[{"kind":"field","key":"spell_dc","label":"DC de conjuración","type":"number","editableBy":"dm","min":0},{"kind":"field","key":"spell_attack_bonus","label":"Bono de ataque de hechizo","type":"number","editableBy":"dm","format":"signed"},{"kind":"field","key":"spell_ability","label":"Característica de lanzamiento","type":"short","editableBy":"dm"},{"kind":"table","type":"libre","key":"espacios_conjuro","label":"Espacios de conjuro","columns":[{"key":"nivel","label":"Nivel","type":"number","editableBy":"dm"},{"key":"disponibles","label":"Disponibles","type":"number","editableBy":"dm","reset":{"to":"column","column":"maximo"}},{"key":"maximo","label":"Máximo","type":"number","editableBy":"dm"}],"editableBy":"dm","sortBy":{"column":"nivel","direction":"asc"}},{"kind":"table","type":"habilidad","key":"hechizos","label":"Hechizos","columns":[{"key":"nombre","label":"Nombre","type":"short","editableBy":"player"},{"key":"categoria","label":"Categoría","type":"short","editableBy":"player"},{"key":"escuela","label":"Escuela","type":"short","editableBy":"player"},{"key":"tiempo_lanzamiento","label":"Tiempo de lanzamiento","type":"short","editableBy":"player"},{"key":"alcance","label":"Alcance","type":"short","editableBy":"player"},{"key":"componentes","label":"Componentes","type":"short","editableBy":"player"},{"key":"duracion","label":"Duración","type":"short","editableBy":"player"},{"key":"a_niveles_superiores","label":"A niveles superiores","type":"paragraph","editableBy":"player"},{"key":"concentracion","label":"Concentración","type":"boolean","editableBy":"player"},{"key":"ritual","label":"Ritual","type":"boolean","editableBy":"player"},{"key":"preparado","label":"Preparado","type":"boolean","editableBy":"player","scope":"character"}],"editableBy":"dm","categories":[{"key":"trucos","label":"Trucos"},{"key":"nivel_1","label":"Nivel 1"},{"key":"nivel_2","label":"Nivel 2"},{"key":"nivel_3","label":"Nivel 3"},{"key":"nivel_4","label":"Nivel 4"},{"key":"nivel_5","label":"Nivel 5"},{"key":"nivel_6","label":"Nivel 6"},{"key":"nivel_7","label":"Nivel 7"},{"key":"nivel_8","label":"Nivel 8"},{"key":"nivel_9","label":"Nivel 9"},{"key":"rasgos","label":"Rasgos y dotes"}]}],"blocks":[{"key":"b_casting","mode":"tile","items":["spell_dc","spell_attack_bonus","spell_ability"]},{"key":"b_slots","mode":"plano","items":["espacios_conjuro"]},{"key":"b_spells","mode":"modal","items":["hechizos"],"filterCategories":["trucos","nivel_1","nivel_2","nivel_3","nivel_4","nivel_5","nivel_6","nivel_7","nivel_8","nivel_9","rasgos"]}]}]},{"key":"equipo_rasgos","label":"Equipo y rasgos","sections":[{"key":"ataques","label":"Ataques","items":[{"kind":"table","type":"libre","key":"ataques","label":"Ataques","columns":[{"key":"nombre","label":"Arma","type":"short","editableBy":"player"},{"key":"bono_ataque","label":"Bono de ataque","type":"short","editableBy":"player"},{"key":"dano","label":"Daño","type":"short","editableBy":"player"},{"key":"tipo_dano","label":"Tipo","type":"short","editableBy":"player"},{"key":"alcance","label":"Alcance","type":"short","editableBy":"player"},{"key":"notas","label":"Notas","type":"paragraph","editableBy":"player"},{"key":"precio","label":"Precio","type":"number","editableBy":"player","default":0},{"key":"precio_moneda","label":"Moneda","type":"short","editableBy":"player","default":"gp"},{"key":"portando","label":"Portando","type":"boolean","editableBy":"player","default":true},{"key":"valor","label":"Valor","type":"number","formula":"{precio} * lookup({dinero}, \"key\", {precio_moneda}, \"value\", lookup({dinero}, \"key\", \"gp\", \"value\", 0))","editableBy":"dm"}],"editableBy":"dm"}],"blocks":[{"key":"b_attacks","mode":"plano","items":["ataques"]}]},{"key":"recursos","label":"Recursos","items":[{"kind":"table","type":"libre","key":"recursos","label":"Recursos","columns":[{"key":"nombre","label":"Nombre","type":"short","editableBy":"player"},{"key":"actual","label":"Actual","type":"number","editableBy":"player","reset":{"to":"column","column":"maximo"}},{"key":"maximo","label":"Máximo","type":"number","editableBy":"player"},{"key":"recuperacion","label":"Recuperación","type":"options","display":"select","default":"largo","editableBy":"player","options":[{"key":"largo","label":"Descanso largo"},{"key":"corto","label":"Descanso corto"}]},{"key":"notas","label":"Notas","type":"paragraph","editableBy":"player"}],"editableBy":"dm"}],"blocks":[{"key":"b_resources","mode":"plano","items":["recursos"]}]},{"key":"equipo","label":"Equipo","items":[{"kind":"table","type":"libre","key":"equipo","label":"Equipo","columns":[{"key":"nombre","label":"Nombre","type":"short","editableBy":"player"},{"key":"cantidad","label":"Cantidad","type":"number","editableBy":"player","default":1},{"key":"descripcion","label":"Descripción","type":"paragraph","editableBy":"player"},{"key":"precio","label":"Precio","type":"number","editableBy":"player","default":0},{"key":"precio_moneda","label":"Moneda","type":"short","editableBy":"player","default":"gp"},{"key":"portando","label":"Portando","type":"boolean","editableBy":"player","default":true},{"key":"valor","label":"Valor","type":"number","formula":"{precio} * {cantidad} * lookup({dinero}, \"key\", {precio_moneda}, \"value\", lookup({dinero}, \"key\", \"gp\", \"value\", 0))","editableBy":"dm"}],"editableBy":"dm"},{"kind":"table","type":"monedas","key":"dinero","label":"Dinero","rows":[{"key":"cp","label":"Cobre","value":1},{"key":"sp","label":"Plata","value":10},{"key":"ep","label":"Electrum","value":50},{"key":"gp","label":"Oro","value":100},{"key":"pp","label":"Platino","value":1000}],"rewardDestination":true},{"kind":"field","key":"valor_equipo","label":"Valor del equipo","type":"number","editableBy":"dm","hidden":true,"calc":{"table":"equipo","column":"valor","op":"suma"}},{"kind":"field","key":"valor_ataques","label":"Valor de los ataques","type":"number","editableBy":"dm","hidden":true,"calc":{"table":"ataques","column":"valor","op":"suma"}},{"kind":"field","key":"valor_inventario","label":"Valor del inventario","type":"number","editableBy":"dm","formula":"{valor_equipo} + {valor_ataques}"}],"blocks":[{"key":"b_equipment","mode":"plano","items":["equipo"]},{"key":"b_coins","mode":"plano","items":["dinero"]},{"key":"b_inventory_value","mode":"tile","items":["valor_inventario"]}]},{"key":"rasgos","label":"Rasgos","items":[{"kind":"field","key":"rasgos_clase","label":"Rasgos de clase","type":"paragraph","editableBy":"dm"},{"kind":"field","key":"otros_rasgos","label":"Otros rasgos","type":"paragraph","editableBy":"dm"},{"kind":"field","key":"idiomas","label":"Idiomas","type":"short","editableBy":"dm"},{"kind":"field","key":"prof_armas","label":"Competencia con armas","type":"short","editableBy":"dm"},{"kind":"field","key":"prof_armaduras","label":"Competencia con armaduras","type":"short","editableBy":"dm"},{"kind":"field","key":"prof_herramientas","label":"Competencia con herramientas","type":"short","editableBy":"dm"}],"blocks":[{"key":"b_traits","mode":"tile","items":["rasgos_clase","otros_rasgos","idiomas","prof_armas","prof_armaduras","prof_herramientas"]}]}]},{"key":"historia","label":"Historia","sections":[{"key":"narrativa","label":"Narrativa","items":[{"kind":"field","key":"trasfondo","label":"Trasfondo","type":"paragraph","editableBy":"player"},{"kind":"field","key":"motivo","label":"Motivo","type":"paragraph","editableBy":"player"}],"blocks":[{"key":"b_story","mode":"tile","items":["trasfondo","motivo"]}]},{"key":"apariencia","label":"Apariencia","items":[{"kind":"field","key":"edad","label":"Edad","type":"short","editableBy":"player"},{"kind":"field","key":"altura","label":"Altura","type":"short","editableBy":"player"},{"kind":"field","key":"peso","label":"Peso","type":"short","editableBy":"player"},{"kind":"field","key":"ojos","label":"Ojos","type":"short","editableBy":"player"},{"kind":"field","key":"piel","label":"Piel","type":"short","editableBy":"player"},{"kind":"field","key":"pelo","label":"Pelo","type":"short","editableBy":"player"},{"kind":"field","key":"apariencia","label":"Apariencia","type":"paragraph","editableBy":"player"},{"kind":"field","key":"personalidad","label":"Personalidad","type":"paragraph","editableBy":"player"},{"kind":"field","key":"ideales","label":"Ideales","type":"paragraph","editableBy":"player"},{"kind":"field","key":"vinculos","label":"Vínculos","type":"paragraph","editableBy":"player"},{"kind":"field","key":"defectos","label":"Defectos","type":"paragraph","editableBy":"player"}],"blocks":[{"key":"b_looks","mode":"tile","items":["edad","altura","peso","ojos","piel","pelo"]},{"key":"b_personality","mode":"tile","items":["apariencia","personalidad","ideales","vinculos","defectos"]}]}]}],"roles":{"hp":"stat_hp","hp_current":"stat_hp_current","ac":"stat_ac","speed":"stat_speed","initiative":"stat_initiative"}}$dnd5e_sheet$::jsonb);

------------------------------------------------------------------------------
-- Backfill (dry run first: begin; <this update>; rollback; the update tag is the count)
------------------------------------------------------------------------------
update public.campaigns
set system_profile = jsonb_set(system_profile, '{sheet}', public._sheet_mark_reward_destination(system_profile -> 'sheet'))
where jsonb_typeof(system_profile -> 'sheet') = 'object'
  and public._sheet_mark_reward_destination(system_profile -> 'sheet') is distinct from system_profile -> 'sheet';

------------------------------------------------------------------------------
-- _reward_target: where the coins of a campaign go (see the header). Internal.
------------------------------------------------------------------------------
create function public._reward_target(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sheet jsonb;
  v_coin jsonb;
  v_dest jsonb;
  v_section text;
  v_denoms jsonb;
begin
  select c.system_profile -> 'sheet' into v_sheet from public.campaigns c where c.id = p_campaign_id;
  if jsonb_typeof(v_sheet) is distinct from 'object' then
    return jsonb_build_object('mode', 'legacy');
  end if;

  select i into v_coin
  from jsonb_path_query(v_sheet, '$.categories[*].sections[*].items[*] ? (@.kind == "table" && @.type == "monedas")') i
  limit 1;
  if v_coin is null then
    return jsonb_build_object('mode', 'legacy');
  end if;

  v_denoms := case when jsonb_typeof(v_coin -> 'rows') = 'array'
    then (select coalesce(jsonb_agg(r.v ->> 'key' order by r.o), '[]'::jsonb) from jsonb_array_elements(v_coin -> 'rows') with ordinality as r(v, o))
    else '[]'::jsonb end;

  select i.v, s.v ->> 'key' into v_dest, v_section
  from jsonb_path_query(v_sheet, '$.categories[*].sections[*]') as s(v),
       jsonb_array_elements(case when jsonb_typeof(s.v -> 'items') = 'array' then s.v -> 'items' else '[]'::jsonb end) as i(v)
  where i.v ->> 'kind' = 'table' and i.v ->> 'type' in ('monedas', 'economia') and i.v -> 'rewardDestination' = 'true'::jsonb
  limit 1;

  if v_dest is null or jsonb_array_length(v_denoms) = 0 then
    return jsonb_build_object('mode', 'none');
  end if;
  return jsonb_build_object('mode', v_dest ->> 'type', 'key', v_dest ->> 'key', 'section', v_section, 'denominations', v_denoms);
end;
$$;

revoke execute on function public._reward_target(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- _reward_normalize: the amounts of a credit, per the mode of _reward_target. Internal.
--   legacy -> coin_amounts (silent coercion, five keys); sheet -> one entry per denomination, strict (invalid_coins).
------------------------------------------------------------------------------
create function public._reward_normalize(p_target jsonb, p_coins jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_denoms jsonb := p_target -> 'denominations';
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
  v_amount numeric;
begin
  if p_target ->> 'mode' = 'legacy' then
    return public.coin_amounts(p_coins);
  end if;
  if jsonb_typeof(p_coins) is distinct from 'object' then
    raise exception 'invalid_coins';
  end if;

  for v_key in select value from jsonb_array_elements_text(v_denoms) loop
    v_val := p_coins -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      v_amount := 0;
    elsif jsonb_typeof(v_val) = 'number' then
      v_amount := (v_val #>> '{}')::numeric;
    elsif jsonb_typeof(v_val) = 'string' and (v_val #>> '{}') ~ '^[0-9]{1,15}$' then
      v_amount := (v_val #>> '{}')::numeric;
    else
      raise exception 'invalid_coins';
    end if;
    if v_amount < 0 or v_amount <> trunc(v_amount) or v_amount > 1000000000000000 then
      raise exception 'invalid_coins';
    end if;
    v_out := v_out || jsonb_build_object(v_key, v_amount::bigint);
  end loop;

  -- keys that are not denominations: only a zero loses nothing
  for v_key, v_val in select e.key, e.value from jsonb_each(p_coins) e loop
    if not (v_denoms ? v_key) and not (
         (jsonb_typeof(v_val) = 'number' and (v_val #>> '{}')::numeric = 0)
         or (jsonb_typeof(v_val) = 'string' and (v_val #>> '{}') ~ '^0{1,15}$')
         or jsonb_typeof(v_val) = 'null') then
      raise exception 'invalid_coins';
    end if;
  end loop;
  return v_out;
end;
$$;

revoke execute on function public._reward_normalize(jsonb, jsonb) from public, anon, authenticated;

------------------------------------------------------------------------------
-- credit_character_coins: adds coins to the reward destination and flags the section as updated.
-- Internal (invoker, like before): called only from the SECURITY DEFINER RPCs below.
------------------------------------------------------------------------------
create or replace function public.credit_character_coins(
  p_campaign_id uuid, p_character_id bigint, p_coins jsonb, p_now timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_target jsonb := public._reward_target(p_campaign_id);
  v_coins jsonb;
  v_any boolean;
begin
  if v_target ->> 'mode' = 'none' then
    raise exception 'no_reward_destination';
  end if;
  v_coins := public._reward_normalize(v_target, p_coins);

  if v_target ->> 'mode' = 'legacy' then
    update public.pjs
    set monedas = jsonb_build_object(
          'cp', public.coin_value(monedas ->> 'cp') + (v_coins ->> 'cp')::bigint,
          'sp', public.coin_value(monedas ->> 'sp') + (v_coins ->> 'sp')::bigint,
          'ep', public.coin_value(monedas ->> 'ep') + (v_coins ->> 'ep')::bigint,
          'gp', public.coin_value(monedas ->> 'gp') + (v_coins ->> 'gp')::bigint,
          'pp', public.coin_value(monedas ->> 'pp') + (v_coins ->> 'pp')::bigint
        ),
        sections_updated = case
          when v_coins <> public.coin_amounts('{}'::jsonb)
            then sections_updated || jsonb_build_object('equipo', to_jsonb(p_now))
          else sections_updated
        end
    where id = p_character_id and campaign_id = p_campaign_id;
    return;
  end if;

  v_any := exists (select 1 from jsonb_each_text(v_coins) e where e.value <> '0');
  -- one UPDATE computes the new balance from the row it locks (re-evaluated after a concurrent commit), so two credits never lose one
  if v_target ->> 'mode' = 'monedas' then
    update public.pjs
    set monedas = monedas || (
          select coalesce(jsonb_object_agg(e.key, public.coin_value(monedas ->> e.key) + e.value::bigint), '{}'::jsonb)
          from jsonb_each_text(v_coins) e),
        sections_updated = case
          when v_any then sections_updated || jsonb_build_object(v_target ->> 'section', to_jsonb(p_now))
          else sections_updated
        end
    where id = p_character_id and campaign_id = p_campaign_id;
  else
    update public.pjs
    set data = data || jsonb_build_object(v_target ->> 'key',
          (case when jsonb_typeof(data -> (v_target ->> 'key')) = 'object' then data -> (v_target ->> 'key') else '{}'::jsonb end)
          || (select coalesce(jsonb_object_agg(e.key, public.coin_value(data -> (v_target ->> 'key') ->> e.key) + e.value::bigint), '{}'::jsonb)
              from jsonb_each_text(v_coins) e)),
        sections_updated = case
          when v_any then sections_updated || jsonb_build_object(v_target ->> 'section', to_jsonb(p_now))
          else sections_updated
        end
    where id = p_character_id and campaign_id = p_campaign_id;
  end if;
end;
$$;

------------------------------------------------------------------------------
-- play_loteria: as 20261006120200, with the reward destination (legacy sheets: same behaviour)
------------------------------------------------------------------------------
create or replace function public.play_loteria(p_campaign_id uuid, p_character_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz := now();
  v_cfg jsonb;
  v_min_text text;
  v_min integer;
  v_roll integer;
  v_prize jsonb;
  v_target text;
  v_won boolean;
  v_dest jsonb;
  v_def_special jsonb;
  v_def_common jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_campaign_member(p_campaign_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if p_character_id is null then
    if not public.is_campaign_dm(p_campaign_id) then
      raise exception 'character_required';
    end if;
    v_target := 'pot';
  else
    if not exists (
      select 1 from public.pjs p
      where p.id = p_character_id and p.campaign_id = p_campaign_id and p.owner_id = v_uid
    ) then
      raise exception 'not_your_character' using errcode = '42501';
    end if;
    v_target := 'player';
  end if;

  -- S12/S28: no denominations or no reward destination = no lottery; the fixed-column pot cannot hold custom denominations
  v_dest := public._reward_target(p_campaign_id);
  if v_dest ->> 'mode' = 'none' then
    raise exception 'no_reward_destination';
  end if;
  if v_target = 'pot' and v_dest ->> 'mode' <> 'legacy' and exists (
    select 1 from jsonb_array_elements_text(v_dest -> 'denominations') d where d not in ('cp', 'sp', 'ep', 'gp', 'pp')
  ) then
    raise exception 'pot_denominations_unsupported';
  end if;

  select value into v_cfg
  from public.campaign_config
  where campaign_id = p_campaign_id and key = 'loteria';

  v_min_text := v_cfg ->> 'commonMinRoll';
  v_min := case when v_min_text ~ '^[0-9]{1,2}$' then v_min_text::integer else 17 end;
  v_roll := 1 + floor(random() * 20)::integer;

  -- the defaults of a missing config only apply where their denomination exists
  v_def_special := case when v_dest ->> 'mode' = 'legacy' or (v_dest -> 'denominations') @> '["sp"]'::jsonb then '{"sp": 1}'::jsonb else '{}'::jsonb end;
  v_def_common := case when v_dest ->> 'mode' = 'legacy' or (v_dest -> 'denominations') @> '["cp"]'::jsonb then '{"cp": 3}'::jsonb else '{}'::jsonb end;

  if v_roll = 20 then
    v_prize := public._reward_normalize(v_dest, coalesce(v_cfg -> 'specialPrize', v_def_special));
  elsif v_roll >= v_min then
    v_prize := public._reward_normalize(v_dest, coalesce(v_cfg -> 'commonPrize', v_def_common));
  else
    v_prize := public._reward_normalize(v_dest, '{}'::jsonb);
  end if;
  v_won := exists (select 1 from jsonb_each_text(v_prize) e where e.value <> '0');

  begin
    insert into public.game_logs (campaign_id, actor_type, character_id, game, roll, prize, prize_target)
    values (
      p_campaign_id,
      case when v_target = 'player' then 'player' else 'dm' end,
      p_character_id, 'loteria', v_roll, v_prize, v_target
    );
  exception when unique_violation then
    raise exception 'already_played_today';
  end;

  if v_target = 'player' then
    perform public.credit_character_coins(p_campaign_id, p_character_id, v_prize, v_now);
    if v_won then
      -- the player already saw their own prize: do not light up an unread dot for them
      insert into public.read_state (user_id, campaign_id, entity_type, entity_id, section, seen_at)
      values (v_uid, p_campaign_id, 'pjs', p_character_id, coalesce(v_dest ->> 'section', 'equipo'), v_now)
      on conflict (user_id, campaign_id, entity_type, entity_id, section)
      do update set seen_at = excluded.seen_at;
    end if;
  else
    -- upsert: a missing pot row (e.g. an imported campaign) must not silently drop the prize
    insert into public.game_pot (campaign_id, cp, sp, ep, gp, pp)
    values (
      p_campaign_id,
      coalesce((v_prize ->> 'cp')::bigint, 0), coalesce((v_prize ->> 'sp')::bigint, 0),
      coalesce((v_prize ->> 'ep')::bigint, 0), coalesce((v_prize ->> 'gp')::bigint, 0),
      coalesce((v_prize ->> 'pp')::bigint, 0)
    )
    on conflict (campaign_id) do update
      set cp = public.game_pot.cp + excluded.cp,
          sp = public.game_pot.sp + excluded.sp,
          ep = public.game_pot.ep + excluded.ep,
          gp = public.game_pot.gp + excluded.gp,
          pp = public.game_pot.pp + excluded.pp;
  end if;

  return jsonb_build_object('roll', v_roll, 'prize', v_prize, 'prize_target', v_target);
end;
$$;

------------------------------------------------------------------------------
-- assign_pot_to_character: as 20261006120200, paying into the reward destination
-- Errors (message): dm_only, character_not_found, no_reward_destination, pot_denominations_unsupported, invalid_coins, insufficient_pot.
------------------------------------------------------------------------------
create or replace function public.assign_pot_to_character(p_campaign_id uuid, p_character_id bigint, p_coins jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dest jsonb;
  v_coins jsonb;
  v_pot public.game_pot;
begin
  if not public.is_campaign_dm(p_campaign_id) then
    raise exception 'dm_only' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.pjs p where p.id = p_character_id and p.campaign_id = p_campaign_id
  ) then
    raise exception 'character_not_found';
  end if;

  v_dest := public._reward_target(p_campaign_id);
  if v_dest ->> 'mode' = 'none' then
    raise exception 'no_reward_destination';
  end if;
  if v_dest ->> 'mode' <> 'legacy' and exists (
    select 1 from jsonb_array_elements_text(v_dest -> 'denominations') d where d not in ('cp', 'sp', 'ep', 'gp', 'pp')
  ) then
    raise exception 'pot_denominations_unsupported';
  end if;
  v_coins := public._reward_normalize(v_dest, p_coins);

  select * into v_pot from public.game_pot where campaign_id = p_campaign_id for update;
  if not found then
    raise exception 'insufficient_pot';
  end if;
  if exists (select 1 from jsonb_each_text(v_coins) e where coalesce((to_jsonb(v_pot) ->> e.key)::bigint, 0) < e.value::bigint) then
    raise exception 'insufficient_pot';
  end if;

  update public.game_pot
  set cp = cp - coalesce((v_coins ->> 'cp')::bigint, 0),
      sp = sp - coalesce((v_coins ->> 'sp')::bigint, 0),
      ep = ep - coalesce((v_coins ->> 'ep')::bigint, 0),
      gp = gp - coalesce((v_coins ->> 'gp')::bigint, 0),
      pp = pp - coalesce((v_coins ->> 'pp')::bigint, 0)
  where campaign_id = p_campaign_id
  returning * into v_pot;

  perform public.credit_character_coins(p_campaign_id, p_character_id, v_coins, now());

  return to_jsonb(v_pot);
end;
$$;
