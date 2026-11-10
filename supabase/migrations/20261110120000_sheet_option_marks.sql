-- Option marks (odd/tasks/ficha-indice-lateral.md S9): an option of an options field or column may carry `mark`, a short
-- marker (1 to 3 characters, trimmed, no hidden characters) that a capacidades table shows before a row on that option and
-- in its legend. Same rule as validateSheet (src/campaign/system/sheet/sheetModel.ts): a label of at most 3 code points.
-- Additive: a sheet without marks validates exactly as before; validate_sheet rebuilds options through this function, so
-- the mark is kept only because it is copied here.
--
-- Rollback: re-run the _sheet_options definition of 20261105130000_sheet_options_calc.sql. A stored sheet that already uses
-- a mark would then fail validation on its next save until the marks are removed.

create or replace function public._sheet_options(p_src jsonb, p_path text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_opts jsonb := p_src -> 'options';
  v_opt record;
  v_key text;
  v_keys text[] := '{}';
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_display text;
  v_result jsonb;
  v_mark text;
begin
  if jsonb_typeof(v_opts) is distinct from 'array' or jsonb_array_length(v_opts) < 2 or jsonb_array_length(v_opts) > 20 then
    perform public._sheet_fail(p_path || '.options');
  end if;
  for v_opt in select value, ordinality - 1 as i from jsonb_array_elements(v_opts) with ordinality loop
    if jsonb_typeof(v_opt.value) is distinct from 'object' then
      perform public._sheet_fail(p_path || '.options[' || v_opt.i || ']');
    end if;
    v_key := public._sheet_key(v_opt.value -> 'key', p_path || '.options[' || v_opt.i || '].key', true);
    if v_key = any (v_keys) then
      perform public._sheet_fail(p_path || '.options[' || v_opt.i || '].key');
    end if;
    v_keys := v_keys || v_key;
    v_item := jsonb_build_object('key', v_key, 'label', public._sheet_label(v_opt.value -> 'label', p_path || '.options[' || v_opt.i || '].label'));
    if v_opt.value ? 'formula' then
      v_item := v_item || jsonb_build_object('formula', public._sheet_formula(v_opt.value -> 'formula', p_path || '.options[' || v_opt.i || '].formula'));
    end if;
    if v_opt.value ? 'mark' then
      v_mark := public._sheet_label(v_opt.value -> 'mark', p_path || '.options[' || v_opt.i || '].mark');
      if char_length(v_mark) > 3 then
        perform public._sheet_fail(p_path || '.options[' || v_opt.i || '].mark');
      end if;
      v_item := v_item || jsonb_build_object('mark', v_mark);
    end if;
    v_out := v_out || jsonb_build_array(v_item);
  end loop;
  v_display := p_src ->> 'display';
  if jsonb_typeof(p_src -> 'display') is distinct from 'string' or v_display not in ('select', 'checkbox')
     or (v_display = 'checkbox' and jsonb_array_length(v_opts) <> 2) then
    perform public._sheet_fail(p_path || '.display');
  end if;
  v_result := jsonb_build_object('options', v_out, 'display', v_display);
  if p_src ? 'default' then
    if jsonb_typeof(p_src -> 'default') is distinct from 'string' or not ((p_src ->> 'default') = any (v_keys)) then
      perform public._sheet_fail(p_path || '.default');
    end if;
    v_result := v_result || jsonb_build_object('default', p_src -> 'default');
  end if;
  return v_result;
end;
$$;
revoke execute on function public._sheet_options(jsonb, text) from public, anon, authenticated;
