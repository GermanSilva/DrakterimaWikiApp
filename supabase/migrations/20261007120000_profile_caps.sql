-- Server-side caps for public.profiles. They used to exist only in the client form, so a direct
-- PATCH could store an oversized name or a javascript:/http: avatar (rendered in <img src>).

-- Repair rows that would violate the new constraints before adding them.
update public.profiles
   set display_name = left(coalesce(nullif(btrim(display_name), ''), 'Usuario'), 80)
 where char_length(btrim(display_name)) not between 1 and 80;

update public.profiles
   set avatar_url = null
 where avatar_url is not null
   and not (lower(avatar_url) like 'https://%' and char_length(avatar_url) <= 500 and avatar_url !~ '\s');

alter table public.profiles
  add constraint profiles_display_name_len
    check (char_length(btrim(display_name)) between 1 and 80),
  add constraint profiles_avatar_url_https
    check (
      avatar_url is null
      or (lower(avatar_url) like 'https://%' and char_length(avatar_url) <= 500 and avatar_url !~ '\s')
    );

-- Same output as before, but it can never violate the constraints: the name falls back to
-- 'Usuario' when every source is empty, and avatars are https-only, without whitespace.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Usuario'
    ), 80),
    (select u
       from (select coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture') as u) s
      where lower(s.u) like 'https://%' and char_length(s.u) <= 500 and s.u !~ '\s')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
