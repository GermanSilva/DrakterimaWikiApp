-- F2b of the system-agnostic campaigns (odd/tasks/system-agnostic.md, odd/design/sheet-builder.md): the optional
-- `sheet` of the system document (the character sheet as data) is validated and PRESERVED.
--
--   * validate_sheet(jsonb): INTERNAL. Validates the whole sheet (keys, labels, limits, editableBy, Stat/Capacidades/
--     Habilidad/Libre/Monedas tables, blocks and their display modes, coin denominations, formula charset and
--     references, roles) and returns the NORMALISED one: only known properties survive, labels are trimmed.
--     Errors are `invalid_system_profile` (P0001) with the path in DETAIL, e.g. sheet.categories[0].label.
--   * validate_system_profile(jsonb) is redefined to call it when the document has a `sheet`. A document WITHOUT one
--     validates exactly as before and gets none (nothing is invented, no campaign changes; the default stays as is).
--   * set_system_profile is unchanged: it stores whatever validate_system_profile returns.
--
-- Formula semantics (parsing, cycles) live in the client, which is the only thing that evaluates them; the database
-- bounds size, charset and references. Nothing reads the sheet yet, so this adds no visible behaviour.

------------------------------------------------------------------------------
-- Internal helpers. Every failure is `invalid_system_profile` (P0001) with the path in DETAIL, in the same format as
-- the client validator (src/campaign/system/sheet/sheetModel.ts): sheet.categories[0].sections[1].items[2].key
------------------------------------------------------------------------------
create function public._sheet_fail(p_path text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  raise exception 'invalid_system_profile' using detail = 'sheet' || p_path;
end;
$$;

create function public._sheet_label(v jsonb, p_path text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_label text;
begin
  if jsonb_typeof(v) is distinct from 'string' then
    perform public._sheet_fail(p_path);
  end if;
  v_label := regexp_replace(v #>> '{}', '^[[:space:]' || chr(160) || chr(12288) || ']+|[[:space:]' || chr(160) || chr(12288) || ']+$', '', 'g');
  if char_length(v_label) < 1 or char_length(v_label) > 60 or v_label <> public.strip_control_chars(v_label) then
    perform public._sheet_fail(p_path);
  end if;
  return v_label;
end;
$$;

-- p_scoped: a key that never becomes a top level `data` key (columns, categories, sections, blocks) only has to avoid
-- prototype names; the others also avoid every name the application owns.
create function public._sheet_key(v jsonb, p_path text, p_scoped boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
begin
  if jsonb_typeof(v) is distinct from 'string' then
    perform public._sheet_fail(p_path);
  end if;
  v_key := v #>> '{}';
  if v_key !~ '^[a-z][a-z0-9_]{0,39}$' or v_key in ('constructor', 'prototype') then
    perform public._sheet_fail(p_path);
  end if;
  -- '__' separates a row from its column in `data` (row__col), so no top level key may hold it
  if not p_scoped and (strpos(v_key, '__') > 0 or v_key = any (array[
       'nombre', 'jugador', 'imagen_url', 'visible_to', 'monedas', 'monedas_guardado', 'notas', 'sections_updated', 'id', 'nivel',
       'clase', 'raza', 'region', 'estado', 'owner_id', 'campaign_id', 'created_by', 'created_at', 'updated_at', 'data',
       'valor', 'modificador', 'custom_fields'])) then
    perform public._sheet_fail(p_path);
  end if;
  return v_key;
end;
$$;

create function public._sheet_editor(v jsonb, p_path text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if v is distinct from '"dm"'::jsonb and v is distinct from '"player"'::jsonb then
    perform public._sheet_fail(p_path);
  end if;
  return v #>> '{}';
end;
$$;

-- Charset and size only: the language itself is parsed by the client, which runs it (display only, never stored).
create function public._sheet_formula(v jsonb, p_path text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text;
begin
  if jsonb_typeof(v) is distinct from 'string' then
    perform public._sheet_fail(p_path);
  end if;
  v_text := v #>> '{}';
  if char_length(v_text) < 1 or char_length(v_text) > 500
     or v_text !~ ('^[a-z0-9_{}.+*/%()<>=!,' || chr(9) || ' -]+$')
     or btrim(v_text, chr(9) || ' ') = '' then
    perform public._sheet_fail(p_path);
  end if;
  return v_text;
end;
$$;

create function public._sheet_columns(v jsonb, p_path text)
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
    if v_type is null or v_type not in ('short', 'paragraph', 'number', 'boolean') then
      perform public._sheet_fail(v_path || '.type');
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
      if v_col.value -> 'format' is distinct from '"signed"'::jsonb or v_type <> 'number' then
        perform public._sheet_fail(v_path || '.format');
      end if;
      v_format := 'signed';
    end if;
    v_default := null;
    if v_col.value ? 'default' then
      v_default := v_col.value -> 'default';
      if not ((v_type = 'number' and jsonb_typeof(v_default) = 'number')
              or (v_type = 'boolean' and jsonb_typeof(v_default) = 'boolean')
              or (v_type in ('short', 'paragraph') and jsonb_typeof(v_default) = 'string' and char_length(v_default #>> '{}') <= 4000)) then
        perform public._sheet_fail(v_path || '.default');
      end if;
    end if;
    v_out := v_out || jsonb_strip_nulls(jsonb_build_array(jsonb_build_object(
      'key', v_key,
      'label', public._sheet_label(v_col.value -> 'label', v_path || '.label'),
      'type', v_type,
      'formula', v_formula,
      'format', v_format,
      'default', v_default,
      'editableBy', public._sheet_editor(v_col.value -> 'editableBy', v_path || '.editableBy'))));
  end loop;
  return v_out;
end;
$$;

------------------------------------------------------------------------------
-- validate_sheet (internal): returns the NORMALISED sheet or raises with the offending path
------------------------------------------------------------------------------
create function public.validate_sheet(p jsonb)
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
  v_formulas jsonb := '[]'::jsonb;
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
          if v_type is null or v_type not in ('short', 'paragraph', 'number', 'boolean') then
            perform public._sheet_fail(v_ipath || '.type');
          end if;
          v_editor := public._sheet_editor(v_it.value -> 'editableBy', v_ipath || '.editableBy');
          v_formula := null;
          if v_it.value ? 'formula' then
            v_formula := public._sheet_formula(v_it.value -> 'formula', v_ipath || '.formula');
            if v_type not in ('number', 'boolean') then
              perform public._sheet_fail(v_ipath || '.formula');
            end if;
            if v_editor <> 'dm' then
              perform public._sheet_fail(v_ipath || '.editableBy');
            end if;
            v_formulas := v_formulas || jsonb_build_array(jsonb_build_object('path', v_ipath || '.formula', 'text', v_formula, 'locals', '[]'::jsonb));
          end if;
          if v_type = 'number' then
            v_numfields := v_numfields || v_key;
          end if;
          v_field := jsonb_build_object('kind', 'field', 'key', v_key, 'label', public._sheet_label(v_it.value -> 'label', v_ipath || '.label'),
                                        'type', v_type, 'editableBy', v_editor);
          if v_formula is not null then
            v_field := v_field || jsonb_build_object('formula', v_formula);
          end if;
          if v_it.value ? 'format' then
            if v_it.value -> 'format' is distinct from '"signed"'::jsonb or v_type <> 'number' then
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
            if not ((v_type = 'number' and jsonb_typeof(v_value) = 'number')
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
          if v_type is null or v_type not in ('stat', 'capacidades', 'habilidad', 'libre', 'monedas') then
            perform public._sheet_fail(v_ipath || '.type');
          end if;
          v_sec_types := v_sec_types || jsonb_build_object(v_key, v_type);
          v_field := jsonb_build_object('kind', 'table', 'type', v_type, 'key', v_key,
                                        'label', public._sheet_label(v_it.value -> 'label', v_ipath || '.label'));

          if v_type in ('habilidad', 'libre') then
            v_field := v_field || jsonb_build_object(
              'columns', public._sheet_columns(v_it.value -> 'columns', v_ipath || '.columns'),
              'editableBy', public._sheet_editor(v_it.value -> 'editableBy', v_ipath || '.editableBy'));
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
            end loop;

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
                if v_row.value ? 'formula' then
                  v_formulas := v_formulas || jsonb_build_array(jsonb_build_object(
                    'path', v_ipath || '.columns[' || v_row.i || '].formula', 'text', v_row.value ->> 'formula',
                    'locals', to_jsonb(v_col_keys || array['valor', 'modificador'])));
                end if;
              end loop;
            end if;
            if v_type = 'monedas' then
              v_coin_tables := v_coin_tables + 1;
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
                for v_ref in select c ->> 'key' as k, (c ? 'formula') as has_formula from jsonb_array_elements(v_columns) c loop
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
          select jsonb_agg(public._sheet_label(f.value, v_bpath || '.filterCategories[' || (f.ordinality - 1) || ']') order by f.ordinality)
            into v_filter from jsonb_array_elements(v_filter) with ordinality f;
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

  if v_total_sections > 40 or v_total_items > 400 or v_coin_tables > 1 then
    perform public._sheet_fail('.categories');
  end if;
  for v_link in select value as v from jsonb_array_elements(v_links) loop
    if not ((v_link.v ->> 'stat') = any (v_stats)) then
      perform public._sheet_fail(v_link.v ->> 'path');
    end if;
  end loop;

  -- formulas: every reference must exist (cycles are the client's job; the formula is never stored as a result)
  for v_f in select value as v from jsonb_array_elements(v_formulas) loop
    v_cleaned := v_f.v ->> 'text';
    for v_ref in select m[1] as r from regexp_matches(v_cleaned, '\{([^{}]*)\}', 'g') m loop
      if v_ref.r !~ '^[a-z0-9_]+(\.[a-z0-9_]+)?$' or v_ref.r ~ '(^|\.)(constructor|prototype)(\.|$)'
         or not (v_ref.r = any (v_known) or v_f.v -> 'locals' ? v_ref.r) then
        perform public._sheet_fail(v_f.v ->> 'path');
      end if;
    end loop;
    v_cleaned := regexp_replace(v_cleaned, '\{[^{}]*\}', '', 'g');
    if v_cleaned ~ '[{}]' then
      perform public._sheet_fail(v_f.v ->> 'path');
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

revoke execute on function public._sheet_fail(text), public._sheet_label(jsonb, text), public._sheet_key(jsonb, text, boolean),
  public._sheet_editor(jsonb, text), public._sheet_formula(jsonb, text), public._sheet_columns(jsonb, text),
  public.validate_sheet(jsonb) from public, anon, authenticated;

------------------------------------------------------------------------------
-- validate_system_profile: now preserves the optional sheet
------------------------------------------------------------------------------
create or replace function public.validate_system_profile(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_builtin text;
  v_section text;
  v_module text;
  v_denom jsonb;
  v_key text;
  v_seen text[] := '{}';
  v_denoms jsonb := '[]'::jsonb;
  v_builtins jsonb := '{}'::jsonb;
  v_sections jsonb := '{}'::jsonb;
  v_modules jsonb := '{}'::jsonb;
  v_node jsonb;
  v_label text;
  v_min numeric;
  v_max numeric;
  v_enabled jsonb;
  v_sheet jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'invalid_system_profile' using detail = 'document';
  end if;
  if p -> 'version' is distinct from '1'::jsonb then
    raise exception 'invalid_system_profile' using detail = 'version';
  end if;

  -- character.builtins: clase, raza, nivel
  foreach v_builtin in array array['clase', 'raza', 'nivel'] loop
    v_node := p #> array['character', 'builtins', v_builtin];
    if jsonb_typeof(v_node) is distinct from 'object' then
      raise exception 'invalid_system_profile' using detail = 'character.builtins.' || v_builtin;
    end if;
    if jsonb_typeof(v_node -> 'enabled') is distinct from 'boolean' then
      raise exception 'invalid_system_profile' using detail = 'character.builtins.' || v_builtin || '.enabled';
    end if;
    if jsonb_typeof(v_node -> 'label') is distinct from 'string' then
      raise exception 'invalid_system_profile' using detail = 'character.builtins.' || v_builtin || '.label';
    end if;
    v_label := regexp_replace(v_node ->> 'label', '^[[:space:] 　]+|[[:space:] 　]+$', '', 'g');
    if char_length(v_label) < 1 or char_length(v_label) > 60 or v_label <> public.strip_control_chars(v_label) then
      raise exception 'invalid_system_profile' using detail = 'character.builtins.' || v_builtin || '.label';
    end if;
    v_enabled := v_node -> 'enabled';
    if v_builtin = 'nivel' then
      if jsonb_typeof(v_node -> 'min') is distinct from 'number' or jsonb_typeof(v_node -> 'max') is distinct from 'number' then
        raise exception 'invalid_system_profile' using detail = 'character.builtins.nivel.range';
      end if;
      v_min := (v_node ->> 'min')::numeric;
      v_max := (v_node ->> 'max')::numeric;
      if v_min <> trunc(v_min) or v_max <> trunc(v_max) or v_min < 0 or v_max > 1000 or v_min > v_max then
        raise exception 'invalid_system_profile' using detail = 'character.builtins.nivel.range';
      end if;
      v_builtins := v_builtins || jsonb_build_object(v_builtin,
        jsonb_build_object('enabled', v_enabled, 'label', v_label, 'min', v_min::int, 'max', v_max::int));
    else
      v_builtins := v_builtins || jsonb_build_object(v_builtin, jsonb_build_object('enabled', v_enabled, 'label', v_label));
    end if;
  end loop;

  -- character.sections: nine booleans
  foreach v_section in array array['stats', 'habilidades', 'ataques', 'hechizos', 'recursos', 'equipo', 'rasgos', 'narrativa', 'apariencia'] loop
    if jsonb_typeof(p #> array['character', 'sections', v_section]) is distinct from 'boolean' then
      raise exception 'invalid_system_profile' using detail = 'character.sections.' || v_section;
    end if;
    v_sections := v_sections || jsonb_build_object(v_section, p #> array['character', 'sections', v_section]);
  end loop;

  -- currency
  if jsonb_typeof(p #> '{currency,enabled}') is distinct from 'boolean' then
    raise exception 'invalid_system_profile' using detail = 'currency.enabled';
  end if;
  if jsonb_typeof(p #> '{currency,denominations}') is distinct from 'array' or jsonb_array_length(p #> '{currency,denominations}') > 5 then
    raise exception 'invalid_system_profile' using detail = 'currency.denominations';
  end if;
  for v_denom in select * from jsonb_array_elements(p #> '{currency,denominations}') loop
    v_key := v_denom ->> 'key';
    if jsonb_typeof(v_denom) is distinct from 'object'
       or jsonb_typeof(v_denom -> 'key') is distinct from 'string'
       or v_key <> all (array['pp', 'gp', 'ep', 'sp', 'cp'])
       or v_key = any (v_seen)
       or jsonb_typeof(v_denom -> 'label') is distinct from 'string' then
      raise exception 'invalid_system_profile' using detail = 'currency.denominations';
    end if;
    v_label := regexp_replace(v_denom ->> 'label', '^[[:space:] 　]+|[[:space:] 　]+$', '', 'g');
    if char_length(v_label) < 1 or char_length(v_label) > 60 or v_label <> public.strip_control_chars(v_label) then
      raise exception 'invalid_system_profile' using detail = 'currency.denominations';
    end if;
    v_seen := v_seen || v_key;
    v_denoms := v_denoms || jsonb_build_array(jsonb_build_object('key', v_key, 'label', v_label));
  end loop;
  if (p #> '{currency,enabled}') = 'true'::jsonb and jsonb_array_length(v_denoms) = 0 then
    raise exception 'invalid_system_profile' using detail = 'currency.denominations';
  end if;

  -- modules
  foreach v_module in array array['juegos', 'sesion_en_vivo', 'mapas', 'calendario'] loop
    if jsonb_typeof(p #> array['modules', v_module]) is distinct from 'boolean' then
      raise exception 'invalid_system_profile' using detail = 'modules.' || v_module;
    end if;
    v_modules := v_modules || jsonb_build_object(v_module, p #> array['modules', v_module]);
  end loop;

  -- sheet (optional): validated by validate_sheet and preserved; a document without it keeps working unchanged
  if p ? 'sheet' then
    v_sheet := public.validate_sheet(p -> 'sheet');
  end if;

  return jsonb_build_object(
    'version', 1,
    'character', jsonb_build_object('builtins', v_builtins, 'sections', v_sections),
    'currency', jsonb_build_object('enabled', p #> '{currency,enabled}', 'denominations', v_denoms),
    'modules', v_modules
  ) || case when v_sheet is null then '{}'::jsonb else jsonb_build_object('sheet', v_sheet) end;
end;
$$;

revoke execute on function public.validate_system_profile(jsonb) from public, anon, authenticated;
