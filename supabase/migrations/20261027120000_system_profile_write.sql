-- E2a of the system-agnostic campaigns (odd/tasks/system-agnostic.md): the validated write path of the system document,
-- the sheet sections, and the end of the hard-coded 1..20 character level.
--
--   * Sheet sections (version 1, additive): character.sections says which blocks of the character sheet exist
--     (stats, habilidades, ataques, hechizos, recursos, equipo, rasgos, narrativa, apariencia). The default document
--     has them all on, i.e. the sheet the application had before; existing campaigns are backfilled with the same.
--   * pjs.nivel: the table check becomes 0..1000. The real range of a campaign is character.builtins.nivel.min/max of its
--     document (enforced by the form and the DM-only write; a level of a character is never writable by its owner).
--   * validate_system_profile(jsonb): INTERNAL (no API execute). Checks every part of the document and returns the
--     NORMALISED one: only the known keys survive, labels are trimmed. Errors are `invalid_system_profile` (P0001)
--     with the offending path in DETAIL.
--   * set_system_profile(campaign, profile, base): the ONLY way to write campaigns.system_profile. DM of the campaign
--     (a hub owner counts, see 20261025120000) only; `base` is the updated_at the editor was built from, a different
--     stored version raises `campaign_conflict` and writes nothing (the caller re-reads); the row is locked while
--     it is checked and written.
--
-- The column keeps having NO insert/update grant for the API: the function is SECURITY DEFINER with an empty
-- search_path and is the single door. validate_system_profile is not executable by authenticated/anon/public.

------------------------------------------------------------------------------
-- Sections: default for new campaigns, backfill for existing ones
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
  }$profile$::jsonb;

update public.campaigns
set system_profile = jsonb_set(
  system_profile,
  '{character,sections}',
  '{"stats": true, "habilidades": true, "ataques": true, "hechizos": true, "recursos": true, "equipo": true, "rasgos": true, "narrativa": true, "apariencia": true}'::jsonb,
  true)
where system_profile #> '{character,sections}' is null;

------------------------------------------------------------------------------
-- pjs.nivel
------------------------------------------------------------------------------
alter table public.pjs drop constraint pjs_nivel_check;
alter table public.pjs add constraint pjs_nivel_check check (nivel between 0 and 1000);

------------------------------------------------------------------------------
-- validate_system_profile (internal)
------------------------------------------------------------------------------
create function public.validate_system_profile(p jsonb)
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
    v_label := btrim(v_node ->> 'label');
    if char_length(v_label) < 1 or char_length(v_label) > 60 or v_label ~ '[[:cntrl:]]' then
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
    v_label := btrim(v_denom ->> 'label');
    if char_length(v_label) < 1 or char_length(v_label) > 60 or v_label ~ '[[:cntrl:]]' then
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

  return jsonb_build_object(
    'version', 1,
    'character', jsonb_build_object('builtins', v_builtins, 'sections', v_sections),
    'currency', jsonb_build_object('enabled', p #> '{currency,enabled}', 'denominations', v_denoms),
    'modules', v_modules
  );
end;
$$;

revoke execute on function public.validate_system_profile(jsonb) from public, anon, authenticated;

------------------------------------------------------------------------------
-- set_system_profile: the only write path
------------------------------------------------------------------------------
create function public.set_system_profile(p_campaign_id uuid, p_profile jsonb, p_base timestamptz)
returns public.campaigns
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.campaigns;
  v_profile jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Cheap pre-check, no lock: whoever is not a DM of this campaign (a hub owner counts) stops here.
  if not public.is_campaign_dm(p_campaign_id) then
    raise exception 'dm_only' using errcode = '42501';
  end if;

  v_profile := public.validate_system_profile(p_profile);

  select * into v_row from public.campaigns c where c.id = p_campaign_id for update;
  if not found then
    raise exception 'campaign_not_found';
  end if;
  -- Re-check under the lock: the caller may have been demoted while waiting.
  if not public.is_campaign_dm(p_campaign_id) then
    raise exception 'dm_only' using errcode = '42501';
  end if;
  if p_base is null or v_row.updated_at is distinct from p_base then
    raise exception 'campaign_conflict';
  end if;

  update public.campaigns c set system_profile = v_profile where c.id = p_campaign_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.set_system_profile(uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.set_system_profile(uuid, jsonb, timestamptz) to authenticated;
