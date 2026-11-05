-- G2a of the system-agnostic campaigns (odd/tasks/system-agnostic.md S19, S21, S24, S29; odd/design/sheet-builder.md section 2,
-- "Formula language, G1 additions"): the sheet validator now accepts the text and table formulas of the client language
-- (src/campaign/system/formula/formula.ts), exactly when the client validator (sheetModel.ts) does.
--
--   * _sheet_formula(jsonb, text): the charset is now ANY character except control characters other than tab (C0, DEL, C1),
--     length 1..500, not blank. Text literals can hold any text; the language outside literals is checked by
--     _sheet_formula_uses.
--   * _sheet_formula_uses(text) (NEW, internal): lexes a formula like the client tokenizer (text literals, {references},
--     names, numbers, operators; anything else outside a literal is "bad") and returns its references, the plain ones
--     apart, and the table functions' (table, column) pairs (suma / promedio / conteo / lookup).
--   * validate_sheet(jsonb) is redefined, otherwise unchanged: a formula may sit on a short field (number and boolean as
--     before; paragraph still not), a formula field may carry `hidden` (a boolean, only with a formula), every table
--     reference of a formula must be the key of a free, habilidad or coin table (a coin table exposes key, label, value)
--     whose columns include the ones the formula names, and a table key is never a plain value. Row formula columns of
--     free and habilidad tables (locals = the columns of their table) were already accepted.
--   * validate_system_profile is unchanged: it calls validate_sheet. Cycles stay the client's job.
--
-- Rollback (manual, not part of the migration): re-run the definitions of _sheet_formula and validate_sheet from
-- 20261028120000_sheet_validation.sql, then `drop function public._sheet_formula_uses(text);`. A stored sheet that already
-- uses text or table formulas, hidden or short formula fields would then fail validation on its next save.

create or replace function public._sheet_formula(v jsonb, p_path text)
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
     or v_text ~ '[\u0001-\u0008\u000a-\u001f\u007f-\u009f]'
     or btrim(v_text, chr(9) || ' ') = '' then
    perform public._sheet_fail(p_path);
  end if;
  return v_text;
end;
$$;

-- Lexes a formula the way the client tokenizer does and reports what it reads. Returns
--   { bad: boolean, refs: [every {reference}], plain: [references read as values],
--     columns: [{ table, column }] }   (column is null when the table is only named, as in conteo({t}))
-- A table reference is the first argument of suma / promedio / conteo / lookup; a column name is the quoted text in the
-- column position of such a call (conteo and suma / promedio: argument 2; lookup: arguments 2 and 4). bad: an unclosed
-- text or reference, a reference that is not a key (or names a prototype), or a character the language does not have.
-- It does not parse: the client does, so a malformed formula can still pass here, as before.
create or replace function public._sheet_formula_uses(p_text text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_i int := 1;
  v_n int := char_length(p_text);
  v_ch text;
  v_end int;
  v_tok text;
  v_prev text := '';
  v_pending text := 'other';
  v_kinds text[] := '{}';
  v_args int[] := '{}';
  v_tabs text[] := '{}';
  v_depth int := 0;
  v_refs jsonb := '[]'::jsonb;
  v_plain jsonb := '[]'::jsonb;
  v_cols jsonb := '[]'::jsonb;
  v_bad jsonb := '{"bad": true, "refs": [], "plain": [], "columns": []}'::jsonb;
begin
  while v_i <= v_n loop
    v_ch := substr(p_text, v_i, 1);
    if v_ch = ' ' or v_ch = chr(9) then
      v_i := v_i + 1;
    elsif v_ch = '"' then
      v_end := position('"' in substr(p_text, v_i + 1));
      if v_end = 0 then
        return v_bad;
      end if;
      v_tok := substr(p_text, v_i + 1, v_end - 1);
      if v_depth > 0 and v_prev = ',' and v_tabs[v_depth] is not null
         and ((v_kinds[v_depth] = 'agg' and v_args[v_depth] = 1) or (v_kinds[v_depth] = 'lookup' and v_args[v_depth] in (1, 3))) then
        v_cols := v_cols || jsonb_build_array(jsonb_build_object('table', v_tabs[v_depth], 'column', v_tok));
      end if;
      v_i := v_i + v_end + 1;
      v_prev := 'str';
    elsif v_ch = '{' then
      v_end := position('}' in substr(p_text, v_i + 1));
      if v_end = 0 then
        return v_bad;
      end if;
      v_tok := substr(p_text, v_i + 1, v_end - 1);
      if v_tok !~ '^[a-z0-9_]+(\.[a-z0-9_]+)?$' or v_tok ~ '(^|\.)(__proto__|constructor|prototype)(\.|$)' then
        return v_bad;
      end if;
      v_refs := v_refs || to_jsonb(v_tok);
      if v_depth > 0 and v_prev = '(' and v_kinds[v_depth] in ('agg', 'lookup') and v_args[v_depth] = 0 then
        v_tabs[v_depth] := v_tok;
        v_cols := v_cols || jsonb_build_array(jsonb_build_object('table', v_tok, 'column', null));
      else
        v_plain := v_plain || to_jsonb(v_tok);
      end if;
      v_i := v_i + v_end + 1;
      v_prev := 'ref';
    elsif v_ch ~ '[a-z]' then
      v_tok := substring(substr(p_text, v_i) from '^[a-z]+');
      v_pending := case when v_tok in ('suma', 'promedio', 'conteo') then 'agg' when v_tok = 'lookup' then 'lookup' else 'other' end;
      v_i := v_i + char_length(v_tok);
      v_prev := 'name';
    elsif v_ch ~ '[0-9.]' then
      v_i := v_i + 1;
      v_prev := 'num';
    elsif v_ch = '(' then
      v_depth := v_depth + 1;
      v_kinds[v_depth] := case when v_prev = 'name' then v_pending else 'other' end;
      v_args[v_depth] := 0;
      v_tabs[v_depth] := null;
      v_i := v_i + 1;
      v_prev := '(';
    elsif v_ch = ')' then
      if v_depth > 0 then
        v_kinds := v_kinds[1:v_depth - 1];
        v_args := v_args[1:v_depth - 1];
        v_tabs := v_tabs[1:v_depth - 1];
        v_depth := v_depth - 1;
      end if;
      v_i := v_i + 1;
      v_prev := ')';
    elsif v_ch = ',' then
      if v_depth > 0 then
        v_args[v_depth] := v_args[v_depth] + 1;
      end if;
      v_i := v_i + 1;
      v_prev := ',';
    elsif strpos('+-*/%&<>=!', v_ch) > 0 then
      v_i := v_i + 1;
      v_prev := 'op';
    else
      return v_bad;
    end if;
  end loop;
  return jsonb_build_object('bad', false, 'refs', v_refs, 'plain', v_plain, 'columns', v_cols);
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
            if v_type not in ('number', 'boolean', 'short') then
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
          if v_it.value ? 'hidden' then
            if jsonb_typeof(v_it.value -> 'hidden') is distinct from 'boolean' or v_formula is null then
              perform public._sheet_fail(v_ipath || '.hidden');
            end if;
            v_field := v_field || jsonb_build_object('hidden', v_it.value -> 'hidden');
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
          v_table_keys := v_table_keys || v_key;
          v_field := jsonb_build_object('kind', 'table', 'type', v_type, 'key', v_key,
                                        'label', public._sheet_label(v_it.value -> 'label', v_ipath || '.label'));

          if v_type in ('habilidad', 'libre') then
            v_field := v_field || jsonb_build_object(
              'columns', public._sheet_columns(v_it.value -> 'columns', v_ipath || '.columns'),
              'editableBy', public._sheet_editor(v_it.value -> 'editableBy', v_ipath || '.editableBy'));
            select coalesce(jsonb_agg(c ->> 'key'), '[]'::jsonb) into v_value from jsonb_array_elements(v_field -> 'columns') c;
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

revoke execute on function public._sheet_formula_uses(text) from public, anon, authenticated;
