-- G6a of the system-agnostic campaigns (odd/tasks/system-agnostic.md S35, S36, S37; S22, S23 for context). HIGH RISK: new tables,
-- RLS and SECURITY DEFINER trigger functions.
--
-- Part 1: column scope. A Habilidad table column may declare scope 'entry' (default; belongs to the collection entry, shared by
--   every character that links it) or 'character' (per-character state: prepared, uses...). It is rejected on any other table
--   type and on a column with a formula; absent stays absent. Same rules as src/campaign/system/sheet/sheetModel.ts.
--   Redefined with create or replace (unchanged otherwise): _sheet_columns(jsonb, text) and validate_sheet(jsonb).
--
-- Part 2: the shared ACTION COLLECTION of a campaign.
--   campaign_actions   one entry: the Habilidad table of the sheet it belongs to (table_key), its category (a key of the table's
--                      categories when it declares them, free text otherwise), name, description, extras (entry-scope column
--                      values keyed by column key), optional private_to_pj and an optional function (jsonb, bounded; its content is
--                      validated by G6c).
--   pj_action_links    a character LINKS an entry (S36): state holds only that character's own values (character-scope columns).
--   Both carry campaign_id; composite foreign keys (pjs / campaign_actions, id + campaign_id) make a link between a character and
--   an entry of different campaigns impossible, as for every other child table.
--
--   Deletes: private_to_pj is ON DELETE CASCADE. A private entry is "the character's own action" (S36); once the character is
--   gone it is orphan content nobody can link, so it goes with it (SET NULL would turn it into a shared entry of the catalogue,
--   leaking private content to the DM catalogue and to any later link). Links cascade from the character, the entry and the
--   campaign.
--   Dedupe: unique (campaign_id, table_key, category, lower(btrim(name)), coalesce(private_to_pj, 0)): one shared entry per
--   name in a table and category (S37: "deduplicated by name + category per campaign"), and one private entry per name for each
--   character, which may reuse a shared name. Character ids are positive identities, so 0 never collides.
--
--   RLS: the DM of the campaign has full CRUD on both tables. A member reads an entry only when it is linked to a character they
--   own, or private to a character they own; reads the links of their own characters; never inserts or deletes entries or links; and
--   may UPDATE a link's state only (column grant), judged by validate_pj_action_link(): only character-scope columns, values by the
--   same _sheet_value_ok rules as the F3/G4a character guard (nothing is weakened), and only when the entry's Habilidad table is
--   editableBy 'player'. Non-members and anon get nothing. Entries are DM content (only the DM writes them, S37).
--   Triggers (SECURITY DEFINER, empty search_path, no execute for API roles): validate_campaign_action (entry against the sheet),
--   validate_pj_action_link (private-entry rule, state rules). Stable reasons (the exception message, see KNOWN_REASONS):
--   action_not_in_sheet, invalid_action_category, invalid_action_extras, action_private_to_other_character, invalid_link_state
--   (SQLSTATE 23514) and link_state_not_writable (42501).
--   Validation runs on write; changing the sheet later does not rewrite stored entries (a stale extras key stays until the DM
--   edits it, and unchanged keys are never re-judged).
--   Realtime: both tables are published like the entities (RLS filters inserts/updates; DELETE events carry ids only, see the note in
--   20261006120200). No unread dots: the collection is not an entity (S22: session edits do not stamp), read_state is untouched.
--
-- ROLLBACK (manual, not part of the migration): drop table public.pj_action_links; drop table public.campaign_actions;
--   drop function public.validate_pj_action_link(); drop function public.validate_campaign_action(); then re-run the
--   _sheet_columns definition of 20261105130000_sheet_options_calc.sql and the validate_sheet definition of
--   20261105140000_sheet_categories_economy.sql (a stored sheet that uses scope would then fail validation on its next save).

------------------------------------------------------------------------------
-- Part 1: column scope
------------------------------------------------------------------------------

create or replace function public._sheet_columns(v jsonb, p_path text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_col record;
  v_out jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
  v_path text;
  v_key text;
  v_type text;
  v_formula text;
  v_format text;
  v_default jsonb;
  v_spec jsonb;
  v_reset jsonb;
  v_r jsonb;
  v_scope text;
begin
  if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v) > 12 then
    perform public._sheet_fail(p_path);
  end if;
  for v_col in select value, ordinality - 1 as i from jsonb_array_elements(v) with ordinality loop
    v_path := p_path || '[' || v_col.i || ']';
    if jsonb_typeof(v_col.value) is distinct from 'object' then
      perform public._sheet_fail(v_path);
    end if;
    v_key := public._sheet_key(v_col.value -> 'key', v_path || '.key', true);
    if v_key = any (v_seen) then
      perform public._sheet_fail(v_path || '.key');
    end if;
    v_seen := v_seen || v_key;
    v_type := v_col.value ->> 'type';
    if v_type is null or v_type not in ('short', 'paragraph', 'number', 'boolean', 'options') then
      perform public._sheet_fail(v_path || '.type');
    end if;
    v_spec := null;
    if v_type = 'options' then
      v_spec := public._sheet_options(v_col.value, v_path);
    else
      if v_col.value ? 'options' then
        perform public._sheet_fail(v_path || '.options');
      end if;
      if v_col.value ? 'display' then
        perform public._sheet_fail(v_path || '.display');
      end if;
    end if;
    v_formula := null;
    if v_col.value ? 'formula' then
      v_formula := public._sheet_formula(v_col.value -> 'formula', v_path || '.formula');
      if v_type not in ('number', 'boolean') then
        perform public._sheet_fail(v_path || '.formula');
      end if;
    end if;
    v_format := null;
    if v_col.value ? 'format' then
      if v_col.value -> 'format' is distinct from '"signed"'::jsonb or v_type not in ('number', 'options') then
        perform public._sheet_fail(v_path || '.format');
      end if;
      v_format := 'signed';
    end if;
    v_default := null;
    if v_col.value ? 'default' then
      v_default := v_col.value -> 'default';
      if not (v_type = 'options' -- checked against the option keys by _sheet_options
              or (v_type = 'number' and jsonb_typeof(v_default) = 'number')
              or (v_type = 'boolean' and jsonb_typeof(v_default) = 'boolean')
              or (v_type in ('short', 'paragraph') and jsonb_typeof(v_default) = 'string' and char_length(v_default #>> '{}') <= 4000)) then
        perform public._sheet_fail(v_path || '.default');
      end if;
    end if;
    -- reset (a free or skill table only: validate_sheet rejects it on a Capacidades column): a custom number column goes
    -- to zero, to a fixed value or to another number column of the table
    v_reset := null;
    if v_col.value ? 'reset' then
      v_r := v_col.value -> 'reset';
      if v_type <> 'number' or v_formula is not null or jsonb_typeof(v_r) is distinct from 'object' then
        perform public._sheet_fail(v_path || '.reset');
      end if;
      if v_r -> 'to' = '"zero"'::jsonb then
        v_reset := '{"to": "zero"}'::jsonb;
      elsif v_r -> 'to' = '"value"'::jsonb and jsonb_typeof(v_r -> 'value') = 'number' then
        v_reset := jsonb_build_object('to', 'value', 'value', v_r -> 'value');
      elsif v_r -> 'to' = '"column"'::jsonb and jsonb_typeof(v_r -> 'column') = 'string' and (v_r ->> 'column') <> v_key
            and exists (select 1 from jsonb_array_elements(v) c where c ->> 'key' = v_r ->> 'column' and c ->> 'type' = 'number') then
        v_reset := jsonb_build_object('to', 'column', 'column', v_r -> 'column');
      else
        perform public._sheet_fail(v_path || '.reset');
      end if;
    end if;
    -- scope (G6a): a Habilidad column belongs to the collection entry ('entry', the default) or is per-character state
    -- ('character'); computed columns have no scope. validate_sheet rejects the property on any other table type.
    v_scope := null;
    if v_col.value ? 'scope' then
      if v_col.value -> 'scope' not in ('"entry"'::jsonb, '"character"'::jsonb) or v_formula is not null then
        perform public._sheet_fail(v_path || '.scope');
      end if;
      v_scope := v_col.value ->> 'scope';
    end if;
    v_out := v_out || jsonb_strip_nulls(jsonb_build_array(jsonb_build_object(
      'key', v_key,
      'label', public._sheet_label(v_col.value -> 'label', v_path || '.label'),
      'type', v_type,
      'formula', v_formula,
      'format', v_format,
      'default', v_default,
      'options', v_spec -> 'options',
      'display', v_spec -> 'display',
      'reset', v_reset,
      'scope', v_scope,
      'editableBy', public._sheet_editor(v_col.value -> 'editableBy', v_path || '.editableBy'))));
  end loop;
  return v_out;
end;
$$;

create or replace function public.validate_sheet(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_keys text[] := '{}';
  v_known text[] := array['nivel'];
  v_cat_keys text[] := '{}';
  v_sec_keys text[] := '{}';
  v_stats text[] := '{}';
  v_numfields text[] := '{}';
  v_links jsonb := '[]'::jsonb;
  v_tables jsonb := '{}'::jsonb; -- table key -> column names, for the tables a formula can read as rows (free, skill, coin)
  v_table_keys text[] := '{}'; -- every table, whatever its kind
  v_uses jsonb;
  v_formulas jsonb := '[]'::jsonb;
  v_calcs jsonb := '[]'::jsonb; -- table calculations of fields, checked once every table is known
  v_spec jsonb; v_calc jsonb; v_sort jsonb;
  v_coin_tables int := 0;
  v_total_items int := 0;
  v_total_sections int := 0;
  v_cats jsonb := '[]'::jsonb;
  v_roles jsonb := '{}'::jsonb;
  v_cat record; v_sec record; v_it record; v_row record; v_blk record; v_ref record; v_role record; v_link record; v_f record;
  v_cpath text; v_spath text; v_ipath text; v_rpath text; v_bpath text;
  v_sections jsonb; v_items jsonb; v_blocks jsonb; v_rows jsonb; v_columns jsonb; v_filter jsonb;
  v_sec_items text[]; v_sec_types jsonb; v_shown text[]; v_block_keys text[]; v_row_keys text[];
  v_key text; v_type text; v_formula text; v_editor text; v_mode text; v_target text; v_kind text;
  v_field jsonb; v_value jsonb; v_values numeric[]; v_col_keys text[]; v_cleaned text; v_ref_text text;
  v_item_count int;
  v_action_cats jsonb := '{}'::jsonb; -- Habilidad table key -> the category keys it declares
  v_cats_in jsonb; v_declared jsonb; v_cat_seen text[];
  v_economy_tables int := 0;
  v_rewards int := 0;
begin
  -- Bound the work before walking anything: the loops below are quadratic in the number of keys.
  if octet_length(p::text) > 49152 then
    perform public._sheet_fail('');
  end if;
  if jsonb_typeof(p) is distinct from 'object' then
    perform public._sheet_fail('');
  end if;
  if jsonb_typeof(p -> 'categories') is distinct from 'array' or jsonb_array_length(p -> 'categories') > 12 then
    perform public._sheet_fail('.categories');
  end if;

  for v_cat in select value, ordinality - 1 as i from jsonb_array_elements(p -> 'categories') with ordinality loop
    v_cpath := '.categories[' || v_cat.i || ']';
    if jsonb_typeof(v_cat.value) is distinct from 'object' then
      perform public._sheet_fail(v_cpath);
    end if;
    v_key := public._sheet_key(v_cat.value -> 'key', v_cpath || '.key', true);
    if v_key = any (v_cat_keys) then
      perform public._sheet_fail(v_cpath || '.key');
    end if;
    v_cat_keys := v_cat_keys || v_key;
    if jsonb_typeof(v_cat.value -> 'sections') is distinct from 'array' or jsonb_array_length(v_cat.value -> 'sections') > 12 then
      perform public._sheet_fail(v_cpath || '.sections');
    end if;
    v_total_sections := v_total_sections + jsonb_array_length(v_cat.value -> 'sections');
    v_sections := '[]'::jsonb;

    for v_sec in select value, ordinality - 1 as i from jsonb_array_elements(v_cat.value -> 'sections') with ordinality loop
      v_spath := v_cpath || '.sections[' || v_sec.i || ']';
      if jsonb_typeof(v_sec.value) is distinct from 'object' then
        perform public._sheet_fail(v_spath);
      end if;
      v_key := public._sheet_key(v_sec.value -> 'key', v_spath || '.key', true);
      if v_key = 'dm' then
        perform public._sheet_fail(v_spath || '.key'); -- the dm unread stamp is frozen for players
      end if;
      if v_key = any (v_sec_keys) then
        perform public._sheet_fail(v_spath || '.key');
      end if;
      v_sec_keys := v_sec_keys || v_key;
      if jsonb_typeof(v_sec.value -> 'items') is distinct from 'array' or jsonb_array_length(v_sec.value -> 'items') > 60 then
        perform public._sheet_fail(v_spath || '.items');
      end if;
      v_total_items := v_total_items + jsonb_array_length(v_sec.value -> 'items');
      v_items := '[]'::jsonb;
      v_sec_items := '{}';
      v_sec_types := '{}'::jsonb;

      for v_it in select value, ordinality - 1 as i from jsonb_array_elements(v_sec.value -> 'items') with ordinality loop
        v_ipath := v_spath || '.items[' || v_it.i || ']';
        if jsonb_typeof(v_it.value) is distinct from 'object' then
          perform public._sheet_fail(v_ipath);
        end if;
        v_key := public._sheet_key(v_it.value -> 'key', v_ipath || '.key', false);
        if v_key = any (v_keys) then
          perform public._sheet_fail(v_ipath || '.key');
        end if;
        v_keys := v_keys || v_key;
        v_known := v_known || v_key;
        v_sec_items := v_sec_items || v_key;
        v_kind := v_it.value ->> 'kind';

        if v_kind = 'field' then
          v_type := v_it.value ->> 'type';
          if v_type is null or v_type not in ('short', 'paragraph', 'number', 'boolean', 'options') then
            perform public._sheet_fail(v_ipath || '.type');
          end if;
          v_editor := public._sheet_editor(v_it.value -> 'editableBy', v_ipath || '.editableBy');
          v_spec := null;
          if v_type = 'options' then
            v_spec := public._sheet_options(v_it.value, v_ipath);
            -- an option formula of a field has no locals
            for v_ref in select o.value as o, o.ordinality - 1 as j from jsonb_array_elements(v_spec -> 'options') with ordinality o loop
              if v_ref.o ? 'formula' then
                v_formulas := v_formulas || jsonb_build_array(jsonb_build_object(
                  'path', v_ipath || '.options[' || v_ref.j || '].formula', 'text', v_ref.o ->> 'formula', 'locals', '[]'::jsonb));
              end if;
            end loop;
          else
            if v_it.value ? 'options' then
              perform public._sheet_fail(v_ipath || '.options');
            end if;
            if v_it.value ? 'display' then
              perform public._sheet_fail(v_ipath || '.display');
            end if;
          end if;
          v_formula := null;
          if v_it.value ? 'formula' then
            v_formula := public._sheet_formula(v_it.value -> 'formula', v_ipath || '.formula');
            if v_type not in ('number', 'boolean', 'short') then
              perform public._sheet_fail(v_ipath || '.formula');
            end if;
            if v_editor <> 'dm' then
              perform public._sheet_fail(v_ipath || '.editableBy');
            end if;
            v_formulas := v_formulas || jsonb_build_array(jsonb_build_object('path', v_ipath || '.formula', 'text', v_formula, 'locals', '[]'::jsonb));
          end if;
          -- a calculation over a table column instead of a formula (S16, S34): shape here, table and column once every table is known
          v_calc := null;
          if v_it.value ? 'calc' then
            if v_it.value ? 'formula' then
              perform public._sheet_fail(v_ipath || '.calc');
            end if;
            v_calc := public._sheet_calc(v_it.value -> 'calc', v_ipath || '.calc');
            if v_calc ->> 'op' in ('suma', 'promedio', 'conteo', 'mayor', 'menor') then
              if v_type <> 'number' then
                perform public._sheet_fail(v_ipath || '.type');
              end if;
            elsif v_type not in ('number', 'short') then
              perform public._sheet_fail(v_ipath || '.type');
            end if;
            if v_editor <> 'dm' then
              perform public._sheet_fail(v_ipath || '.editableBy');
            end if;
            v_calcs := v_calcs || jsonb_build_array(jsonb_build_object('path', v_ipath || '.calc', 'calc', v_calc));
          end if;
          if v_type = 'number' then
            v_numfields := v_numfields || v_key;
          end if;
          v_field := jsonb_build_object('kind', 'field', 'key', v_key, 'label', public._sheet_label(v_it.value -> 'label', v_ipath || '.label'),
                                        'type', v_type, 'editableBy', v_editor);
          if v_formula is not null then
            v_field := v_field || jsonb_build_object('formula', v_formula);
          end if;
          if v_calc is not null then
            v_field := v_field || jsonb_build_object('calc', v_calc);
          end if;
          if v_spec is not null then
            v_field := v_field || jsonb_build_object('options', v_spec -> 'options', 'display', v_spec -> 'display');
          end if;
          if v_it.value ? 'format' then
            if v_it.value -> 'format' is distinct from '"signed"'::jsonb or v_type not in ('number', 'options') then
              perform public._sheet_fail(v_ipath || '.format');
            end if;
            v_field := v_field || jsonb_build_object('format', 'signed');
          end if;
          if v_it.value ? 'overridable' then
            if jsonb_typeof(v_it.value -> 'overridable') is distinct from 'boolean' or v_formula is null then
              perform public._sheet_fail(v_ipath || '.overridable');
            end if;
            v_field := v_field || jsonb_build_object('overridable', v_it.value -> 'overridable');
          end if;
          if v_it.value ? 'hidden' then
            if jsonb_typeof(v_it.value -> 'hidden') is distinct from 'boolean' or (v_formula is null and v_calc is null) then
              perform public._sheet_fail(v_ipath || '.hidden');
            end if;
            v_field := v_field || jsonb_build_object('hidden', v_it.value -> 'hidden');
          end if;
          if v_it.value ? 'searchable' then
            if jsonb_typeof(v_it.value -> 'searchable') is distinct from 'boolean' or v_type not in ('short', 'number') then
              perform public._sheet_fail(v_ipath || '.searchable');
            end if;
            v_field := v_field || jsonb_build_object('searchable', v_it.value -> 'searchable');
          end if;
          foreach v_target in array array['min', 'max'] loop
            if v_it.value ? v_target then
              if v_type <> 'number' or jsonb_typeof(v_it.value -> v_target) is distinct from 'number' then
                perform public._sheet_fail(v_ipath || '.' || v_target);
              end if;
              v_field := v_field || jsonb_build_object(v_target, v_it.value -> v_target);
            end if;
          end loop;
          if v_it.value ? 'default' then
            v_value := v_it.value -> 'default';
            if not (v_type = 'options' -- the default of an options field is checked against its keys by _sheet_options
                    or (v_type = 'number' and jsonb_typeof(v_value) = 'number')
                    or (v_type = 'boolean' and jsonb_typeof(v_value) = 'boolean')
                    or (v_type in ('short', 'paragraph') and jsonb_typeof(v_value) = 'string' and char_length(v_value #>> '{}') <= 4000)) then
              perform public._sheet_fail(v_ipath || '.default');
            end if;
            v_field := v_field || jsonb_build_object('default', v_value);
          end if;
          v_sec_types := v_sec_types || jsonb_build_object(v_key, 'field');
          v_items := v_items || jsonb_build_array(v_field);

        elsif v_kind = 'table' then
          v_type := v_it.value ->> 'type';
          if v_type is null or v_type not in ('stat', 'capacidades', 'habilidad', 'libre', 'monedas', 'economia') then
            perform public._sheet_fail(v_ipath || '.type');
          end if;
          v_sec_types := v_sec_types || jsonb_build_object(v_key, v_type);
          v_table_keys := v_table_keys || v_key;
          if v_it.value ? 'sortBy' and v_type not in ('habilidad', 'libre') then
            perform public._sheet_fail(v_ipath || '.sortBy');
          end if;
          if v_it.value ? 'categories' and v_type <> 'habilidad' then
            perform public._sheet_fail(v_ipath || '.categories'); -- only Habilidad tables declare action categories
          end if;
          if v_it.value ? 'rewardDestination' and v_type not in ('monedas', 'economia') then
            perform public._sheet_fail(v_ipath || '.rewardDestination');
          end if;
          v_field := jsonb_build_object('kind', 'table', 'type', v_type, 'key', v_key,
                                        'label', public._sheet_label(v_it.value -> 'label', v_ipath || '.label'));

          if v_type in ('habilidad', 'libre') then
            v_field := v_field || jsonb_build_object(
              'columns', public._sheet_columns(v_it.value -> 'columns', v_ipath || '.columns'),
              'editableBy', public._sheet_editor(v_it.value -> 'editableBy', v_ipath || '.editableBy'));
            select coalesce(jsonb_agg(c ->> 'key'), '[]'::jsonb) into v_value from jsonb_array_elements(v_field -> 'columns') c;
            if v_type = 'libre' then
              for v_row in select value, ordinality - 1 as i from jsonb_array_elements(v_field -> 'columns') with ordinality loop
                if v_row.value ? 'scope' then
                  perform public._sheet_fail(v_ipath || '.columns[' || v_row.i || '].scope'); -- scope is a Habilidad (action collection) concept
                end if;
              end loop;
            end if;
            v_tables := v_tables || jsonb_build_object(v_key, v_value);
            -- the guard judges these tables as one value, so a table the player writes cannot hold a DM column
            if v_field ->> 'editableBy' = 'player' then
              for v_row in select value, ordinality - 1 as i from jsonb_array_elements(v_field -> 'columns') with ordinality loop
                if v_row.value ->> 'editableBy' = 'dm' then
                  perform public._sheet_fail(v_ipath || '.columns[' || v_row.i || '].editableBy');
                end if;
              end loop;
            end if;
            for v_row in select value, ordinality - 1 as i from jsonb_array_elements(v_field -> 'columns') with ordinality loop
              if v_row.value ? 'formula' then
                select coalesce(array_agg(c ->> 'key'), '{}') into v_col_keys from jsonb_array_elements(v_field -> 'columns') c;
                v_formulas := v_formulas || jsonb_build_array(jsonb_build_object(
                  'path', v_ipath || '.columns[' || v_row.i || '].formula', 'text', v_row.value ->> 'formula', 'locals', to_jsonb(v_col_keys)));
              end if;
              if v_row.value ? 'options' then
                select coalesce(array_agg(c ->> 'key'), '{}') into v_col_keys from jsonb_array_elements(v_field -> 'columns') c;
                for v_ref in select o.value as o, o.ordinality - 1 as j from jsonb_array_elements(v_row.value -> 'options') with ordinality o loop
                  if v_ref.o ? 'formula' then
                    v_formulas := v_formulas || jsonb_build_array(jsonb_build_object(
                      'path', v_ipath || '.columns[' || v_row.i || '].options[' || v_ref.j || '].formula', 'text', v_ref.o ->> 'formula', 'locals', to_jsonb(v_col_keys)));
                  end if;
                end loop;
              end if;
            end loop;
            if v_it.value ? 'sortBy' then
              v_sort := v_it.value -> 'sortBy';
              if jsonb_typeof(v_sort) is distinct from 'object' then
                perform public._sheet_fail(v_ipath || '.sortBy');
              end if;
              if jsonb_typeof(v_sort -> 'column') is distinct from 'string'
                 or not exists (select 1 from jsonb_array_elements(v_field -> 'columns') c where c ->> 'key' = v_sort ->> 'column') then
                perform public._sheet_fail(v_ipath || '.sortBy.column');
              end if;
              if v_sort -> 'direction' is distinct from '"asc"'::jsonb and v_sort -> 'direction' is distinct from '"desc"'::jsonb then
                perform public._sheet_fail(v_ipath || '.sortBy.direction');
              end if;
              v_field := v_field || jsonb_build_object('sortBy', jsonb_build_object('column', v_sort -> 'column', 'direction', v_sort -> 'direction'));
            end if;
            -- action categories (S23): 1..30 ordered { key, label }, unique keys; modal blocks over this table name them by key
            if v_it.value ? 'categories' then
              v_cats_in := v_it.value -> 'categories';
              if jsonb_typeof(v_cats_in) is distinct from 'array' or jsonb_array_length(v_cats_in) < 1 or jsonb_array_length(v_cats_in) > 30 then
                perform public._sheet_fail(v_ipath || '.categories');
              end if;
              v_cat_seen := '{}';
              v_value := '[]'::jsonb;
              for v_row in select value, ordinality - 1 as i from jsonb_array_elements(v_cats_in) with ordinality loop
                if jsonb_typeof(v_row.value) is distinct from 'object' then
                  perform public._sheet_fail(v_ipath || '.categories[' || v_row.i || ']');
                end if;
                v_key := public._sheet_key(v_row.value -> 'key', v_ipath || '.categories[' || v_row.i || '].key', true);
                if v_key = any (v_cat_seen) then
                  perform public._sheet_fail(v_ipath || '.categories[' || v_row.i || '].key');
                end if;
                v_cat_seen := v_cat_seen || v_key;
                v_value := v_value || jsonb_build_array(jsonb_build_object(
                  'key', v_key, 'label', public._sheet_label(v_row.value -> 'label', v_ipath || '.categories[' || v_row.i || '].label')));
              end loop;
              v_field := v_field || jsonb_build_object('categories', v_value);
              v_action_cats := v_action_cats || jsonb_build_object(v_field ->> 'key', to_jsonb(v_cat_seen));
            end if;

          elsif v_type = 'economia' then
            -- amounts per denomination of the coin table live on the character at data[key]: no columns, no rows, DM only
            v_economy_tables := v_economy_tables + 1;
            if v_it.value ? 'rows' then
              perform public._sheet_fail(v_ipath || '.rows');
            end if;
            if v_it.value ? 'columns' then
              perform public._sheet_fail(v_ipath || '.columns');
            end if;
            if public._sheet_editor(v_it.value -> 'editableBy', v_ipath || '.editableBy') <> 'dm' then
              perform public._sheet_fail(v_ipath || '.editableBy'); -- the sheet guard does not derive an amounts object for players
            end if;
            v_field := v_field || jsonb_build_object('editableBy', 'dm');

          else
            v_item_count := case when v_type = 'monedas' then 8 else 100 end; -- a CASE inside an IF condition would end it at the first THEN
            if jsonb_typeof(v_it.value -> 'rows') is distinct from 'array'
               or jsonb_array_length(v_it.value -> 'rows') > v_item_count then
              perform public._sheet_fail(v_ipath || '.rows');
            end if;
            v_rows := '[]'::jsonb;
            v_values := '{}';
            if v_type = 'capacidades' then
              v_columns := public._sheet_columns(v_it.value -> 'columns', v_ipath || '.columns');
              v_field := v_field || jsonb_build_object('columns', v_columns);
              select coalesce(array_agg(c ->> 'key'), '{}') into v_col_keys from jsonb_array_elements(v_columns) c;
              for v_row in select value, ordinality - 1 as i from jsonb_array_elements(v_columns) with ordinality loop
                if v_row.value ? 'scope' then
                  perform public._sheet_fail(v_ipath || '.columns[' || v_row.i || '].scope'); -- scope is a Habilidad (action collection) concept
                end if;
                if v_row.value ? 'reset' then
                  perform public._sheet_fail(v_ipath || '.columns[' || v_row.i || '].reset'); -- only free and skill tables have resettable columns
                end if;
                if v_row.value ? 'formula' then
                  v_formulas := v_formulas || jsonb_build_array(jsonb_build_object(
                    'path', v_ipath || '.columns[' || v_row.i || '].formula', 'text', v_row.value ->> 'formula',
                    'locals', to_jsonb(v_col_keys || array['valor', 'modificador'])));
                end if;
                if v_row.value ? 'options' then
                  for v_ref in select o.value as o, o.ordinality - 1 as j from jsonb_array_elements(v_row.value -> 'options') with ordinality o loop
                    if v_ref.o ? 'formula' then
                      v_formulas := v_formulas || jsonb_build_array(jsonb_build_object(
                        'path', v_ipath || '.columns[' || v_row.i || '].options[' || v_ref.j || '].formula', 'text', v_ref.o ->> 'formula',
                        'locals', to_jsonb(v_col_keys || array['valor', 'modificador'])));
                    end if;
                  end loop;
                end if;
              end loop;
            end if;
            if v_type = 'monedas' then
              v_coin_tables := v_coin_tables + 1;
              v_tables := v_tables || jsonb_build_object(v_key, '["key", "label", "value"]'::jsonb);
            end if;

            for v_row in select value, ordinality - 1 as i from jsonb_array_elements(v_it.value -> 'rows') with ordinality loop
              v_rpath := v_ipath || '.rows[' || v_row.i || ']';
              if jsonb_typeof(v_row.value) is distinct from 'object' then
                perform public._sheet_fail(v_rpath);
              end if;
              v_key := public._sheet_key(v_row.value -> 'key', v_rpath || '.key', false);
              if v_key = any (v_keys) then
                perform public._sheet_fail(v_rpath || '.key');
              end if;
              v_keys := v_keys || v_key;
              v_known := v_known || v_key;
              v_value := jsonb_build_object('key', v_key, 'label', public._sheet_label(v_row.value -> 'label', v_rpath || '.label'));

              if v_type = 'stat' then
                if not (v_row.value ? 'modifier') then
                  perform public._sheet_fail(v_rpath || '.modifier');
                end if;
                v_formula := public._sheet_formula(v_row.value -> 'modifier', v_rpath || '.modifier');
                v_formulas := v_formulas || jsonb_build_array(jsonb_build_object('path', v_rpath || '.modifier', 'text', v_formula, 'locals', '["valor"]'::jsonb));
                v_stats := v_stats || v_key;
                v_known := v_known || (v_key || '.valor') || (v_key || '.modificador');
                v_value := v_value || jsonb_build_object('modifier', v_formula, 'editableBy', public._sheet_editor(v_row.value -> 'editableBy', v_rpath || '.editableBy'));
              elsif v_type = 'capacidades' then
                if jsonb_typeof(v_row.value -> 'stat') is distinct from 'string' then
                  perform public._sheet_fail(v_rpath || '.stat');
                end if;
                v_links := v_links || jsonb_build_array(jsonb_build_object('path', v_rpath || '.stat', 'stat', v_row.value ->> 'stat'));
                if v_row.value ->> 'use' is null or v_row.value ->> 'use' not in ('valor', 'modificador') then
                  perform public._sheet_fail(v_rpath || '.use');
                end if;
                -- a column is a plain stored value unless it has a formula or an option with one
                for v_ref in select c ->> 'key' as k,
                              ((c ? 'formula') or exists (select 1 from jsonb_array_elements(coalesce(c -> 'options', '[]'::jsonb)) o where o ? 'formula')) as has_formula
                         from jsonb_array_elements(v_columns) c loop
                  if not v_ref.has_formula then
                    v_known := v_known || (v_key || '.' || v_ref.k);
                  end if;
                end loop;
                v_value := v_value || jsonb_build_object('stat', v_row.value ->> 'stat', 'use', v_row.value ->> 'use',
                                                         'editableBy', public._sheet_editor(v_row.value -> 'editableBy', v_rpath || '.editableBy'));
              else
                if jsonb_typeof(v_row.value -> 'value') is distinct from 'number'
                   or (v_row.value ->> 'value')::numeric <> trunc((v_row.value ->> 'value')::numeric)
                   or (v_row.value ->> 'value')::numeric < 1 or (v_row.value ->> 'value')::numeric > 1000000000 then
                  perform public._sheet_fail(v_rpath || '.value');
                end if;
                v_values := v_values || (v_row.value ->> 'value')::numeric;
                v_value := v_value || jsonb_build_object('value', v_row.value -> 'value');
              end if;
              v_rows := v_rows || jsonb_build_array(v_value);
            end loop;

            if v_type = 'monedas' and cardinality(v_values) > 0 then
              if (select count(distinct x) from unnest(v_values) x) <> cardinality(v_values) or (select min(x) from unnest(v_values) x) <> 1 then
                perform public._sheet_fail(v_ipath || '.rows');
              end if;
            end if;
            v_field := v_field || jsonb_build_object('rows', v_rows);
          end if;
          -- at most one table of the sheet is the reward destination (the coin table or an economy table)
          if v_it.value ? 'rewardDestination' then
            if jsonb_typeof(v_it.value -> 'rewardDestination') is distinct from 'boolean' then
              perform public._sheet_fail(v_ipath || '.rewardDestination');
            end if;
            if (v_it.value ->> 'rewardDestination')::boolean then
              v_rewards := v_rewards + 1;
              if v_rewards > 1 then
                perform public._sheet_fail(v_ipath || '.rewardDestination');
              end if;
            end if;
            v_field := v_field || jsonb_build_object('rewardDestination', v_it.value -> 'rewardDestination');
          end if;
          v_items := v_items || jsonb_build_array(v_field);
        else
          perform public._sheet_fail(v_ipath || '.kind');
        end if;
      end loop;

      -- blocks of this section
      if jsonb_typeof(v_sec.value -> 'blocks') is distinct from 'array' or jsonb_array_length(v_sec.value -> 'blocks') > 60 then
        perform public._sheet_fail(v_spath || '.blocks');
      end if;
      v_blocks := '[]'::jsonb;
      v_shown := '{}';
      v_block_keys := '{}';
      for v_blk in select value, ordinality - 1 as i from jsonb_array_elements(v_sec.value -> 'blocks') with ordinality loop
        v_bpath := v_spath || '.blocks[' || v_blk.i || ']';
        if jsonb_typeof(v_blk.value) is distinct from 'object' then
          perform public._sheet_fail(v_bpath);
        end if;
        v_key := public._sheet_key(v_blk.value -> 'key', v_bpath || '.key', true);
        if v_key = any (v_block_keys) then
          perform public._sheet_fail(v_bpath || '.key');
        end if;
        v_block_keys := v_block_keys || v_key;
        v_mode := v_blk.value ->> 'mode';
        if v_mode is null or v_mode not in ('stat', 'tile', 'capacidades', 'plano', 'modal') then
          perform public._sheet_fail(v_bpath || '.mode');
        end if;
        if jsonb_typeof(v_blk.value -> 'items') is distinct from 'array' then
          perform public._sheet_fail(v_bpath || '.items');
        end if;
        for v_ref in select value as v from jsonb_array_elements(v_blk.value -> 'items') loop
          if jsonb_typeof(v_ref.v) is distinct from 'string' or not ((v_ref.v #>> '{}') = any (v_sec_items)) or (v_ref.v #>> '{}') = any (v_shown) then
            perform public._sheet_fail(v_bpath || '.items');
          end if;
          v_shown := v_shown || (v_ref.v #>> '{}');
          v_target := v_sec_types ->> (v_ref.v #>> '{}');
          if not (case v_mode
                    when 'stat' then v_target = 'stat'
                    when 'capacidades' then v_target = 'capacidades'
                    when 'modal' then v_target = 'habilidad'
                    when 'tile' then v_target = 'field'
                    else true end) then
            perform public._sheet_fail(v_bpath || '.mode');
          end if;
        end loop;
        v_value := jsonb_build_object('key', v_key, 'mode', v_mode, 'items', v_blk.value -> 'items');
        if v_blk.value ? 'title' then
          v_value := v_value || jsonb_build_object('title', public._sheet_label(v_blk.value -> 'title', v_bpath || '.title'));
        end if;
        if v_mode = 'modal' then
          v_filter := v_blk.value -> 'filterCategories';
          if jsonb_typeof(v_filter) is distinct from 'array' or jsonb_array_length(v_filter) < 1 or jsonb_array_length(v_filter) > 20 then
            perform public._sheet_fail(v_bpath || '.filterCategories');
          end if;
          -- the first Habilidad table of the block decides: one that declares categories is filtered by those keys, any other by free text
          v_declared := null;
          for v_ref in select value as v from jsonb_array_elements(v_blk.value -> 'items') loop
            if v_sec_types ->> (v_ref.v #>> '{}') = 'habilidad' then
              v_declared := v_action_cats -> (v_ref.v #>> '{}');
              exit;
            end if;
          end loop;
          if v_declared is not null then
            for v_ref in select f.value as v, f.ordinality - 1 as i from jsonb_array_elements(v_filter) with ordinality f loop
              if jsonb_typeof(v_ref.v) is distinct from 'string' or not (v_declared ? (v_ref.v #>> '{}')) then
                perform public._sheet_fail(v_bpath || '.filterCategories[' || v_ref.i || ']');
              end if;
            end loop;
          else
            select jsonb_agg(public._sheet_label(f.value, v_bpath || '.filterCategories[' || (f.ordinality - 1) || ']') order by f.ordinality)
              into v_filter from jsonb_array_elements(v_filter) with ordinality f;
          end if;
          v_value := v_value || jsonb_build_object('filterCategories', v_filter);
        end if;
        v_blocks := v_blocks || jsonb_build_array(v_value);
      end loop;

      v_sections := v_sections || jsonb_build_array(jsonb_build_object(
        'key', v_sec.value ->> 'key', 'label', public._sheet_label(v_sec.value -> 'label', v_spath || '.label'),
        'items', v_items, 'blocks', v_blocks));
    end loop;

    v_cats := v_cats || jsonb_build_array(jsonb_build_object(
      'key', v_cat.value ->> 'key', 'label', public._sheet_label(v_cat.value -> 'label', v_cpath || '.label'), 'sections', v_sections));
  end loop;

  if v_total_sections > 40 or v_total_items > 400 or v_coin_tables > 1 or (v_economy_tables > 0 and v_coin_tables = 0) then
    perform public._sheet_fail('.categories');
  end if;
  for v_link in select value as v from jsonb_array_elements(v_links) loop
    if not ((v_link.v ->> 'stat') = any (v_stats)) then
      perform public._sheet_fail(v_link.v ->> 'path');
    end if;
  end loop;

  -- formulas: the text is lexed (strings are text, anything else outside the language is rejected), every reference must
  -- exist, a table reference must be a free, skill or coin table with the columns it names, and a table is never a plain
  -- value (cycles are the client's job; the formula is never stored as a result)
  for v_f in select value as v from jsonb_array_elements(v_formulas) loop
    v_uses := public._sheet_formula_uses(v_f.v ->> 'text');
    if (v_uses ->> 'bad')::boolean then
      perform public._sheet_fail(v_f.v ->> 'path');
    end if;
    for v_ref in select r from jsonb_array_elements_text(v_uses -> 'refs') r loop
      if v_ref.r ~ '(^|\.)(constructor|prototype)(\.|$)'
         or not (v_ref.r = any (v_known) or v_f.v -> 'locals' ? v_ref.r) then
        perform public._sheet_fail(v_f.v ->> 'path');
      end if;
    end loop;
    for v_ref in select r from jsonb_array_elements_text(v_uses -> 'plain') r loop
      if v_ref.r = any (v_table_keys) and not (v_f.v -> 'locals' ? v_ref.r) then
        perform public._sheet_fail(v_f.v ->> 'path');
      end if;
    end loop;
    for v_link in select value as v from jsonb_array_elements(v_uses -> 'columns') loop
      if not (v_tables ? (v_link.v ->> 'table'))
         or (v_link.v ->> 'column' is not null and not ((v_tables -> (v_link.v ->> 'table')) @> to_jsonb(v_link.v ->> 'column'))) then
        perform public._sheet_fail(v_f.v ->> 'path');
      end if;
    end loop;
  end loop;

  -- calculations: the table must be a free, skill or coin table and the column one of its columns
  for v_f in select value as v from jsonb_array_elements(v_calcs) loop
    if not (v_tables ? (v_f.v -> 'calc' ->> 'table')) then
      perform public._sheet_fail((v_f.v ->> 'path') || '.table');
    end if;
    if v_f.v -> 'calc' ? 'column' and not ((v_tables -> (v_f.v -> 'calc' ->> 'table')) @> to_jsonb(v_f.v -> 'calc' ->> 'column')) then
      perform public._sheet_fail((v_f.v ->> 'path') || '.column');
    end if;
  end loop;

  -- roles
  if p ? 'roles' then
    if jsonb_typeof(p -> 'roles') is distinct from 'object' then
      perform public._sheet_fail('.roles');
    end if;
    for v_role in select key as k, value as v from jsonb_each(p -> 'roles') loop
      if v_role.k not in ('hp', 'hp_current', 'ac', 'speed', 'initiative')
         or jsonb_typeof(v_role.v) is distinct from 'string' or not ((v_role.v #>> '{}') = any (v_numfields)) then
        perform public._sheet_fail('.roles.' || v_role.k);
      end if;
      v_roles := v_roles || jsonb_build_object(v_role.k, v_role.v);
    end loop;
  end if;

  return jsonb_build_object('categories', v_cats, 'roles', v_roles);
end;
$$;

------------------------------------------------------------------------------
-- Part 2: tables
------------------------------------------------------------------------------

create table public.campaign_actions (
  id            bigint generated by default as identity primary key,
  campaign_id   uuid not null references public.campaigns (id) on delete cascade,
  table_key     text not null check (char_length(table_key) between 1 and 64),
  category      text not null default '' check (char_length(category) <= 60),
  name          text not null check (char_length(btrim(name)) between 1 and 200),
  description   text not null default '' check (char_length(description) <= 20000),
  extras        jsonb not null default '{}'::jsonb check (jsonb_typeof(extras) = 'object' and octet_length(extras::text) <= 20000),
  private_to_pj bigint,
  function      jsonb check (function is null or (jsonb_typeof(function) in ('object', 'array') and octet_length(function::text) <= 50000)),
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- target of the composite FK of the links
  unique (id, campaign_id),
  foreign key (private_to_pj, campaign_id) references public.pjs (id, campaign_id) on delete cascade
);
create unique index campaign_actions_dedupe_idx
  on public.campaign_actions (campaign_id, table_key, category, lower(btrim(name)), coalesce(private_to_pj, 0));
create index campaign_actions_private_idx on public.campaign_actions (private_to_pj) where private_to_pj is not null;

create table public.pj_action_links (
  pj_id       bigint not null,
  action_id   bigint not null,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  state       jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (pj_id, action_id),
  foreign key (pj_id, campaign_id) references public.pjs (id, campaign_id) on delete cascade,
  foreign key (action_id, campaign_id) references public.campaign_actions (id, campaign_id) on delete cascade
);
create index pj_action_links_action_idx on public.pj_action_links (action_id);
create index pj_action_links_campaign_idx on public.pj_action_links (campaign_id);

create trigger campaign_actions_set_updated_at before update on public.campaign_actions
  for each row execute function public.set_updated_at();
create trigger pj_action_links_set_updated_at before update on public.pj_action_links
  for each row execute function public.set_updated_at();
create trigger campaign_actions_forbid_campaign_change before update on public.campaign_actions
  for each row execute function public.forbid_campaign_id_change();
create trigger pj_action_links_forbid_campaign_change before update on public.pj_action_links
  for each row execute function public.forbid_campaign_id_change();
create trigger campaign_actions_forbid_identity_change before update on public.campaign_actions
  for each row execute function public.forbid_identity_change();

------------------------------------------------------------------------------
-- Entry validation against the sheet of the campaign
------------------------------------------------------------------------------
-- table_key must be a Habilidad table of the sheet; with declared categories the category must be one of their keys; every extras
-- key must be an entry-scope column (no formula) with a value _sheet_value_ok accepts. Only what changed is re-judged on UPDATE.

create function public.validate_campaign_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sheet jsonb;
  v_table jsonb;
  v_col jsonb;
  v_entry record;
begin
  if tg_op = 'INSERT'
     or new.table_key is distinct from old.table_key or new.category is distinct from old.category
     or new.extras is distinct from old.extras then
    select c.system_profile -> 'sheet' into v_sheet from public.campaigns c where c.id = new.campaign_id;
    select t into v_table
      from jsonb_path_query(v_sheet, '$.categories[*].sections[*].items[*]') t
     where t ->> 'kind' = 'table' and t ->> 'type' = 'habilidad' and t ->> 'key' = new.table_key
     limit 1;
    if v_table is null then
      raise exception 'action_not_in_sheet' using errcode = '23514', detail = 'table_key ' || new.table_key;
    end if;

    if jsonb_typeof(v_table -> 'categories') = 'array' and jsonb_array_length(v_table -> 'categories') > 0
       and not exists (select 1 from jsonb_array_elements(v_table -> 'categories') k where k ->> 'key' = new.category) then
      raise exception 'invalid_action_category' using errcode = '23514', detail = 'category ' || new.category;
    end if;

    if jsonb_typeof(new.extras) = 'object' then
      for v_entry in select e.key as k, e.value as v from jsonb_each(new.extras) e loop
        select c into v_col
          from jsonb_array_elements(coalesce(v_table -> 'columns', '[]'::jsonb)) c
         where c ->> 'key' = v_entry.k and coalesce(c ->> 'scope', 'entry') = 'entry' and not (c ? 'formula')
         limit 1;
        if v_col is null
           or not public._sheet_value_ok(v_entry.v, jsonb_strip_nulls(jsonb_build_object(
                't', v_col ->> 'type',
                'opts', (select jsonb_agg(o ->> 'key') from jsonb_array_elements(v_col -> 'options') o)))) then
          raise exception 'invalid_action_extras' using errcode = '23514', detail = 'extras.' || v_entry.k;
        end if;
      end loop;
    end if;
  end if;

  -- an entry can only be private to the one character it is linked to
  if tg_op = 'UPDATE' and new.private_to_pj is not null and new.private_to_pj is distinct from old.private_to_pj
     and exists (select 1 from public.pj_action_links l where l.action_id = new.id and l.pj_id <> new.private_to_pj) then
    raise exception 'action_private_to_other_character' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger campaign_actions_validate before insert or update on public.campaign_actions
  for each row execute function public.validate_campaign_action();

------------------------------------------------------------------------------
-- Link validation: private entries and state
------------------------------------------------------------------------------
-- A caller that is not the DM of the campaign (a player owning the character, the only other caller RLS lets reach an UPDATE) may
-- change state only on a table the sheet marks editableBy 'player', and only on columns that are character-scope and editableBy
-- 'player'. Everyone is judged on the keys that CHANGED (an unchanged stale key never blocks a save): the key must be a
-- character-scope column without formula and the value must pass _sheet_value_ok (null clears). The DM and callers without a request
-- identity (migrations, service_role) may delete a stale key without it being a column any more.

create function public.validate_pj_action_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_private bigint;
  v_table_key text;
  v_old jsonb := case when tg_op = 'UPDATE' then old.state else '{}'::jsonb end;
  v_player boolean := auth.uid() is not null and not public.is_campaign_dm(new.campaign_id);
  v_sheet jsonb;
  v_table jsonb;
  v_col jsonb;
  v_key text;
begin
  select a.private_to_pj, a.table_key into v_private, v_table_key
    from public.campaign_actions a where a.id = new.action_id and a.campaign_id = new.campaign_id;
  if not found then
    return new; -- the foreign key reports the missing entry
  end if;
  if v_private is not null and v_private <> new.pj_id then
    raise exception 'action_private_to_other_character' using errcode = '23514';
  end if;

  if jsonb_typeof(new.state) is distinct from 'object' or new.state is not distinct from v_old then
    return new; -- not an object: the table check reports it; unchanged: nothing to judge
  end if;

  select c.system_profile -> 'sheet' into v_sheet from public.campaigns c where c.id = new.campaign_id;
  select t into v_table
    from jsonb_path_query(v_sheet, '$.categories[*].sections[*].items[*]') t
   where t ->> 'kind' = 'table' and t ->> 'type' = 'habilidad' and t ->> 'key' = v_table_key
   limit 1;

  for v_key in
    select u.k from (select jsonb_object_keys(new.state) as k union select jsonb_object_keys(v_old) as k) u
     where (new.state -> u.k) is distinct from (v_old -> u.k)
  loop
    if not (new.state ? v_key) and not v_player then
      continue;
    end if;
    select c into v_col
      from jsonb_array_elements(coalesce(v_table -> 'columns', '[]'::jsonb)) c
     where c ->> 'key' = v_key and c ->> 'scope' = 'character' and not (c ? 'formula')
     limit 1;
    if v_col is null
       or not public._sheet_value_ok(new.state -> v_key, jsonb_strip_nulls(jsonb_build_object(
            't', v_col ->> 'type',
            'opts', (select jsonb_agg(o ->> 'key') from jsonb_array_elements(v_col -> 'options') o)))) then
      raise exception 'invalid_link_state' using errcode = '23514', detail = 'state.' || v_key;
    end if;
    if v_player and (v_table ->> 'editableBy' is distinct from 'player' or v_col ->> 'editableBy' is distinct from 'player') then
      raise exception 'link_state_not_writable' using errcode = '42501', detail = 'state.' || v_key;
    end if;
  end loop;
  return new;
end;
$$;

create trigger pj_action_links_validate before insert or update on public.pj_action_links
  for each row execute function public.validate_pj_action_link();

revoke execute on function public.validate_campaign_action() from public, anon, authenticated;
revoke execute on function public.validate_pj_action_link() from public, anon, authenticated;

------------------------------------------------------------------------------
-- Privileges and row level security
------------------------------------------------------------------------------

alter table public.campaign_actions enable row level security;
alter table public.pj_action_links  enable row level security;

-- anon gets nothing; authenticated gets only what the policies below narrow down (new tables inherit Supabase's default grants)
revoke all on public.campaign_actions, public.pj_action_links from anon, authenticated;
revoke all on sequence public.campaign_actions_id_seq from anon, authenticated;
grant select, delete on public.campaign_actions to authenticated;
grant insert (campaign_id, table_key, category, name, description, extras, private_to_pj, function) on public.campaign_actions to authenticated;
grant update (table_key, category, name, description, extras, private_to_pj, function) on public.campaign_actions to authenticated;
grant select, delete on public.pj_action_links to authenticated;
grant insert (pj_id, action_id, campaign_id, state) on public.pj_action_links to authenticated;
grant update (state) on public.pj_action_links to authenticated;

-- entries: the DM reads all; a member reads an entry linked to a character they own or private to one
create policy campaign_actions_select on public.campaign_actions
  for select to authenticated
  using (
    public.is_campaign_dm(campaign_id)
    or private_to_pj = any (public.my_character_ids(campaign_id))
    or exists (
      select 1 from public.pj_action_links l
      where l.action_id = campaign_actions.id
        and l.pj_id = any (public.my_character_ids(campaign_actions.campaign_id))
    )
  );
create policy campaign_actions_insert_dm on public.campaign_actions
  for insert to authenticated
  with check (public.is_campaign_dm(campaign_id));
create policy campaign_actions_update_dm on public.campaign_actions
  for update to authenticated
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));
create policy campaign_actions_delete_dm on public.campaign_actions
  for delete to authenticated
  using (public.is_campaign_dm(campaign_id));

-- links: the DM reads and writes all; an owner reads and updates (state only, see validate_pj_action_link) the links of their characters
create policy pj_action_links_select on public.pj_action_links
  for select to authenticated
  using (public.is_campaign_dm(campaign_id) or pj_id = any (public.my_character_ids(campaign_id)));
create policy pj_action_links_insert_dm on public.pj_action_links
  for insert to authenticated
  with check (public.is_campaign_dm(campaign_id));
create policy pj_action_links_update on public.pj_action_links
  for update to authenticated
  using (public.is_campaign_dm(campaign_id) or pj_id = any (public.my_character_ids(campaign_id)))
  with check (public.is_campaign_dm(campaign_id) or pj_id = any (public.my_character_ids(campaign_id)));
create policy pj_action_links_delete_dm on public.pj_action_links
  for delete to authenticated
  using (public.is_campaign_dm(campaign_id));

------------------------------------------------------------------------------
-- Realtime (like the entities)
------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['campaign_actions', 'pj_action_links'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
