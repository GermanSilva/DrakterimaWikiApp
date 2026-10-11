# Hosting y cutover: Supabase + Vercel

Guía para el **OWNER** (quien tiene las cuentas de Supabase, Vercel, Google Cloud, Firebase y GitHub). Lleva la app de
"solo local + GitHub Pages/Firestore" a "Vercel + Supabase alojado" y retira la app legacy.

> **Nada de esto lo hace el código ni un agente por su cuenta.** Todo paso remoto (login, link, push, deploy, import)
> lo ejecuta el OWNER, o un agente solo con autorización explícita del OWNER para **esa operación** (destino, comando y
> credencial). Esta guía no contiene ningún secreto: los valores reales van a un gestor de contraseñas, nunca al repo.

Leyenda de responsable en cada paso: **[OWNER]** lo hace una persona con acceso a las cuentas. **[AUTO]** ya está
automatizado por el repo (no hay que hacerlo a mano).

Documentos relacionados (no se duplican aquí): [`scripts/import/README.md`](../scripts/import/README.md) (importador),
[`src/app/README.md`](../src/app/README.md) (rutas, headers, hardening), [`src/auth/README.md`](../src/auth/README.md)
(flujo de login), [`src/data/README.md`](../src/data/README.md) (capa de datos, Realtime).

## Índice

1. [Decisiones previas del OWNER](#0-decisiones-previas-del-owner)
2. [Prerrequisitos](#a-prerrequisitos)
3. [Crear el proyecto Supabase alojado](#b-crear-el-proyecto-supabase-alojado)
4. [Vincular, migrar y verificar](#c-vincular-migrar-y-verificar)
5. [Configurar Auth en el dashboard](#d-configurar-auth-en-el-dashboard)
6. [Crear el proyecto Vercel](#e-crear-el-proyecto-vercel)
7. [Importar los datos legacy](#f-importar-los-datos-legacy)
8. [Checklist de cutover, go/no-go y rollback](#g-cutover)
9. [Riesgos residuales conocidos](#h-riesgos-residuales)
10. [Tabla de secretos y variables](#tabla-de-secretos-y-variables)

---

## 0. Decisiones previas del OWNER

Resolverlas **antes** de crear los proyectos. Cada una indica la recomendación.

| # | Decisión | Recomendación | Dónde se aplica |
|---|----------|---------------|-----------------|
| D1 | Región de Supabase | La más cercana a los jugadores (para Argentina, `South America (São Paulo)`). **No se puede cambiar después** sin migrar. | (b) |
| D2 | Plan de Supabase | Free sirve para probar; los proyectos Free se **pausan** tras inactividad y no tienen backups diarios. Para datos reales de campaña, Pro. | (b) |
| D3 | Un proyecto Supabase o dos (producción + staging) | Dos: staging (Free) sirve para ensayar migraciones, Realtime y el import completo, y para los deploys de preview de Vercel. | (b), (e) |
| D4 | SMTP / remitente | **Sin dominio propio** (decidido): el correo por defecto de Supabase es solo para pruebas y limita mucho el volumen y los destinatarios, así que hace falta un SMTP propio con **un único remitente verificado** (p. ej. Brevo, *Single sender*: confirmás una casilla tuya por correo). Sin dominio no hay SPF/DKIM propios, por lo que el magic link es *best-effort* y **puede caer en spam**: por eso el login principal es Google (D7). El dominio solo hace falta para firmar con SPF/DKIM propios y mejorar la entrega. Verificar las condiciones vigentes en la doc de Supabase y del proveedor. | (d) |
| D5 | Captcha | **Cloudflare Turnstile (plan gratis), decidido.** No requiere dominio propio (el Site Key se registra para el host de Vercel). Protege solo el envío del magic link: el botón de Google no usa token. Se activa definiendo `VITE_TURNSTILE_SITE_KEY` en Vercel y la clave secreta en Supabase (pasos en d.5). Sin esa variable la app funciona como antes (sin widget ni token). | (d), (e) |
| D6 | Registro abierto o cerrado | Cualquiera con un email puede crear cuenta, pero **ya no puede crear campañas**: solo puede *solicitarlas* y el Hub Owner las aprueba (H15, ver d.6). Opciones en (d). Recomendado para un grupo cerrado: registro abierto + SMTP propio + límites, y reevaluar si aparece abuso. | (d) |
| D7 | Google login | **Login principal (decidido)**: la pantalla muestra Google primero y el magic link por email debajo como alternativa. Configurar Google en d.7 y poner `VITE_AUTH_GOOGLE_ENABLED=true` en Vercel. Si no se configura, poner `false` (la pantalla queda solo con email). | (d), (e) |
| D8 | Dominio | **Sin dominio propio por ahora (decidido): se usa `*.vercel.app`.** Consecuencias: la pantalla de consentimiento de Google muestra `<ref>.supabase.co` (no un dominio tuyo); no hay SPF/DKIM propios (D4). Cambiarlo después obliga a retocar Site URL, redirect URLs, los *Authorized JavaScript origins* de Google y el origen de los links de invitación. | (d), (e) |
| D9 | ¿Staging separado para previews de Vercel? | Sí (D3). Si no, las previews usan la base de **producción**. | (e) |
| D10 | Email real del DM para el import | Necesario para `--dm-email`. | (f) |
| D11 | Ventana de calma y fecha de corte | Avisar a los jugadores; el import se hace con la app legacy congelada. | (f), (g) |
| D12 | Qué pasa con la URL vieja de GitHub Pages | Despublicar, o publicar una página de "nos mudamos a <url>". | (g) |
| D13 | Congelar Firestore como solo lectura durante el corte | Recomendado (reglas de Firestore sin escritura). | (g) |

---

## (a) Prerrequisitos

**[OWNER]** Tener:

- Cuenta de Supabase (organización con permiso para crear proyectos) y cuenta de Vercel conectada a GitHub.
- Acceso admin al repo en GitHub y a la consola de Firebase del proyecto legacy.
- Proyecto de Google Cloud (Google es el login principal, D7).
- Proveedor SMTP (D4): cuenta y credenciales SMTP, con un remitente verificado (sin dominio propio alcanza un *single sender*).
- Un gestor de contraseñas para: contraseña de la base, service role key, URL de la base, secreto de Google, credenciales SMTP.

Herramientas locales (**[OWNER]**, en la máquina que ejecuta los comandos):

| Herramienta | Para qué | Verificar |
|-------------|----------|-----------|
| Node 20 o 22 + `npm ci` | build y scripts | `node --version` |
| Supabase CLI (el repo usa 2.117.x) | `link`, `db push` | `supabase --version` |
| Docker Desktop | solo `supabase start`/`supabase test db` locales y `supabase db dump` | `docker ps` |
| `gh` (GitHub CLI) | solo para retirar secretos/Pages (g) | `gh --version` |

```powershell
node --version
```

```powershell
supabase --version
```

Antes de tocar nada remoto, confirmar que el repo está sano **en local**:

```powershell
npm ci
```

```powershell
npx vitest run
```

```powershell
npm run lint
```

```powershell
npx tsc --noEmit
```

```powershell
npm run build
```

Con Docker y la pila local arriba (`supabase start`), además:

```powershell
supabase test db
```

```powershell
npm run test:integration
```

**Go/no-go 0:** todo en verde. Si algo falla, no seguir.

---

## (b) Crear el proyecto Supabase alojado

**[OWNER]** En <https://supabase.com/dashboard> > *New project*:

1. **Organización**: la propia.
2. **Name**: `drakterima` (producción). Si se hizo D3, repetir luego con `drakterima-staging`.
3. **Database password**: generarla con el gestor de contraseñas (larga, aleatoria). Guardarla ahora: Supabase no la
   vuelve a mostrar (solo se puede **resetear**). Evitar caracteres que compliquen una URL (`@ : / ? # %`), porque se usará
   dentro de `SUPABASE_DB_URL`; si los lleva, hay que codificarlos en porcentaje.
4. **Region**: D1.
5. **Plan**: D2.
6. Esperar a que el proyecto quede *Healthy*.

Dónde está cada dato (todos en el dashboard del proyecto):

| Dato | Dónde | ¿Secreto? | Quién lo usa |
|------|-------|-----------|--------------|
| **Project ref** (`<ref>`, 20 letras) | URL del dashboard y *Project Settings > General* | No | `supabase link`, guardas del importer |
| **Project URL** `https://<ref>.supabase.co` | *Project Settings > API* (o botón *Connect*) | No | `VITE_SUPABASE_URL`, importer (`SUPABASE_URL`) |
| **anon / publishable key** | *Project Settings > API Keys* | **Pública** por diseño (la seguridad es RLS) | `VITE_SUPABASE_ANON_KEY` |
| **service_role / secret key** | *Project Settings > API Keys* | **SECRETA, omnipotente** (se salta RLS) | solo el importer, en la shell del OWNER |
| **Database URL** (con la contraseña) | botón *Connect* > *Connection string* | **SECRETA** | solo el importer (`SUPABASE_DB_URL`) |
| **Database password** | la fijada en el paso 3 | **SECRETA** | `supabase link`/`db push`, `SUPABASE_DB_URL` |

Notas:

- Los proyectos nuevos muestran claves nuevas (*publishable* `sb_publishable_...` y *secret* `sb_secret_...`) además de las
  claves JWT clásicas (*anon* / *service_role*, pestaña *Legacy*). La app usa `supabase-js`; ambos formatos para la clave
  pública deberían funcionar, pero **no verificado contra un proyecto alojado**: si el login falla con la clave nueva, probar con la
  clave `anon` clásica. Lo mismo vale para el importer con la *secret key* (necesita la API de admin de Auth): si la rechaza,
  usar la `service_role` clásica.
- Para el importer usar la cadena del **pooler en modo sesión** (host `*.pooler.supabase.com`, usuario `postgres.<ref>`) en vez
  del host directo `db.<ref>.supabase.co`: el directo es solo IPv6 en proyectos nuevos y muchas redes de Windows no lo
  alcanzan. La guarda del importer acepta ambas formas, pero **solo** del mismo proyecto que `SUPABASE_URL`. No usar el modo
  *transaction* (puerto 6543) para el import: usa una transacción larga y sesión.
- **Nunca** pegar la service role key ni la URL de la base en Vercel, en GitHub Secrets, en `.env.local` versionado o en un chat.

**Go/no-go (b):** proyecto *Healthy*; ref, URL y anon key anotados; secretos en el gestor.

---

## (c) Vincular, migrar y verificar

### c.1 Login y link (OWNER)

Login con el navegador (guarda un token de acceso en la máquina; **es una operación remota**):

```powershell
supabase login
```

Vincular el repo al proyecto (pide la contraseña de la base; escribe `supabase/.temp/`, ignorado por git):

```powershell
supabase link --project-ref <ref>
```

### c.2 Migraciones

Las migraciones están en `supabase/migrations/` (15 archivos, de `20261006120000_campaign_hub_core.sql` a
`20261013120000_hub_owner_hardening.sql`). Ver qué se aplicaría, sin tocar nada:

```powershell
supabase db push --dry-run
```

Aplicar (el resumen debe listar las 15, en orden):

```powershell
supabase db push
```

> **Orden de despliegue:** una migración que cambia permisos de columnas (p. ej. `decided_by` en `campaign_requests`, el `slug` de `campaigns`) deja de funcionar con el frontend anterior. Antes del corte no hay usuarios, así que no importa. Una vez con usuarios reales, desplegá primero el frontend compatible con ambos esquemas y recién después ejecutá `supabase db push`, o hacelo en una ventana de mantenimiento.

Confirmar que local y remoto coinciden (15 filas con ambas columnas llenas):

```powershell
supabase migration list
```

`supabase/seed.sql` **no** se aplica con `db push` (solo lo carga `supabase db reset` en local; crea usuarios falsos de
`example.test`). Nunca ejecutarlo en el proyecto alojado.

> **ADVERTENCIA: no ejecutar `supabase config push`.** `supabase/config.toml` describe la pila **local** (`site_url =
> http://localhost:5173`, límites de correo de prueba, Google desactivado). Empujarlo sobrescribiría la configuración de
> Auth alojada con valores locales. La configuración alojada se hace a mano en el dashboard (sección d).

### c.3 Smoke checks SQL (equivalentes a pgTAP, solo lectura)

**[OWNER]** Dashboard > *SQL Editor* > pegar y ejecutar. Los resultados esperados se obtuvieron ejecutando las mismas consultas
contra la base local con las 15 migraciones (con la salvedad de usuarios: la local tiene los 4 del seed, la alojada debe tener 0).

**1. Tablas publicadas en Realtime.** Esperado: exactamente estas **14** filas:
`campaign_config, disponibilidad, facciones, game_pot, homebrew_rules, items, lore, lugares, map_points, mapas, pjs,
player_availability, pnjs, sesiones`. Debe estar **ausente** `entity_dm_notes` (notas privadas del DM) y también
`player_notes`, `read_state`, `campaign_members`, `campaign_invites`, `campaign_presence`, `profiles`.

```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
```

**2. `visible_to` no es legible por clientes.** Esperado: 10 filas (`facciones, homebrew_rules, items, lore, lugares,
map_points, mapas, pjs, pnjs, sesiones`) con `auth_sel = false` y `anon_sel = false` en todas.

```sql
select c.relname,
       has_column_privilege('authenticated', c.oid, a.attnum, 'SELECT') as auth_sel,
       has_column_privilege('anon', c.oid, a.attnum, 'SELECT') as anon_sel
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and a.attname = 'visible_to' and not a.attisdropped and c.relkind = 'r'
order by 1;
```

**3. RLS activo en todas las tablas.** Esperado: `rls_on = 25`, `rls_off = 0`.

```sql
select count(*) filter (where relrowsecurity) as rls_on,
       count(*) filter (where not relrowsecurity) as rls_off
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';
```

**4. `anon` sin privilegios sobre `public`.** Esperado: `0` y `0`.

```sql
select (select count(*) from information_schema.role_table_grants
         where grantee = 'anon' and table_schema = 'public') as anon_table_privs,
       (select count(*) from information_schema.role_column_grants
         where grantee = 'anon' and table_schema = 'public') as anon_column_privs;
```

**5. `anon` no ejecuta ninguna función de `public`.** Esperado: 0 filas.

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1;
```

**6. Toda función `SECURITY DEFINER` fija `search_path` vacío.** Esperado: `0`.

```sql
select count(*) as definer_without_empty_path
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not (coalesce(array_to_string(p.proconfig, ','), '') like 'search_path=""%');
```

**7. Sin datos de seed.** Esperado: `0` usuarios y `0` campañas.

```sql
select (select count(*) from auth.users) as users, (select count(*) from public.campaigns) as campaigns;
```

**8. Migraciones registradas.** Esperado: `15`.

```sql
select count(*) as migrations from supabase_migrations.schema_migrations;
```

No ejecutar `supabase test db --linked` contra producción: las pruebas pgTAP crean usuarios falsos dentro de una
transacción y requieren la extensión `pgtap`. Si se quiere correrlas en alojado, hacerlo solo en **staging**.

### c.4 Realtime: `visible_to` y columnas solo-DM no deben filtrarse

Las consultas 1 y 2 prueban la configuración. Falta probar el **comportamiento** (el chequeo `has_column_privilege` lo hace el
servidor de Realtime y el local no es el alojado). Procedimiento **[OWNER]**, con dos navegadores (o un perfil + ventana privada):

1. Con la campaña de prueba creada en la app (en staging, o una campaña desechable en producción): usuario A = DM,
   usuario B = jugador con un PJ propio.
2. Como DM, crear un PNJ con estado `secreto` compartido con el PJ de B (o usar uno existente).
3. En el navegador de B abrir DevTools > *Network* > filtro **WS** > conexión `.../realtime/v1/websocket` > *Messages*, y
   abrir `/c/<slug>/pnjs`.
4. Como DM, editar el nombre de ese PNJ y volver a guardar.
5. En los mensajes de B buscar el evento `postgres_changes` con `type: UPDATE`: inspeccionar `data.record`.

Criterio **PASA**: `data.record` **no** contiene la clave `visible_to` y el cuerpo del PNJ (excepto columnas permitidas) llega;
al pasar el PNJ a `borrador` el jugador B **no** recibe frame de ese cambio, y al borrarlo solo llega la clave primaria
(`old: { id }`) sin contenido. Criterio **FALLA**: aparece `visible_to` en cualquier `record` o `old_record`.

Si FALLA: no ir a producción. Contingencia: quitar las tablas afectadas de la publicación (`alter publication
supabase_realtime drop table public.<tabla>;`), con lo que la app deja de actualizarse en vivo; abrir un issue con el frame
sanitizado. Las notas privadas del DM no van por Realtime (se leen bajo demanda), así que no entran en este chequeo.

**Go/no-go (c):** `migration list` coherente; las 8 consultas con el resultado esperado; chequeo Realtime en PASA.

---

## (d) Configurar Auth en el dashboard

**[OWNER]** En *Authentication* del proyecto alojado. Todo manual (ver advertencia de `config push`).

### d.1 URL Configuration

*Authentication > URL Configuration*:

| Campo | Valor |
|-------|-------|
| **Site URL** | `https://<dominio-de-producción>` (sin barra final). Es el destino por defecto y el origen de los enlaces de los correos: **no** puede quedar en `localhost`. |
| **Redirect URLs** | `https://<dominio-de-producción>/auth/callback` |
| | previews de Vercel, patrón con comodín: `https://*-<equipo>.vercel.app/auth/callback` (usar el patrón que muestre Vercel para las URLs de preview del proyecto; los comodines de Supabase son globs: confirmar la sintaxis en su doc) |
| | desarrollo local (opcional): `http://localhost:5173/auth/callback` |

La app arma `redirectTo` con `window.location.origin` + `/auth/callback` (`src/auth/authConfig.ts`): cada origen desde el que
se inicie sesión debe estar en la lista; si no, Supabase cae al Site URL y el login (PKCE, ligado al navegador de origen)
falla en otro origen.

### d.2 Email / magic link

*Authentication > Sign In / Providers > Email*: *Enable Email provider* activo. La app solo usa magic link (`signInWithOtp`);
no hay formulario de contraseña ni de código OTP.

*Authentication > Emails > Templates > Magic Link*: dejar `{{ .ConfirmationURL }}` en el cuerpo (el flujo PKCE necesita ese
enlace). Se puede traducir el texto al español; **no** reemplazar el enlace por `{{ .Token }}` (la app no tiene pantalla para
ingresar códigos).

Limitaciones que conviene avisar a los jugadores (ver también `src/auth/README.md`):

- El enlace debe abrirse **en el mismo navegador** que lo pidió (PKCE guarda el verificador allí). Abrirlo desde el visor
  interno de una app de correo falla con un mensaje de "navegador equivocado".
- Algunos filtros de correo "visitan" los enlaces y los consumen; si el enlace aparece vencido, pedir otro.

### d.3 SMTP propio (D4)

*Authentication > Emails > SMTP Settings* > *Enable Custom SMTP*: host, puerto, usuario, contraseña y remitente de tu proveedor.
Sin esto, el servicio por defecto de Supabase solo está pensado para pruebas (límite de envíos por hora muy bajo y, según
la política vigente, solo a miembros del equipo del proyecto: **verificar en la doc actual**).

**Sin dominio propio (caso actual):**

- Con Brevo (u otro con el mismo modelo), registrar **un único remitente verificado** (*Senders* > *Add a sender*) y confirmar la
  casilla desde el correo de verificación. Usar esa dirección como *Sender email* en Supabase. Verificar en la doc vigente del
  proveedor qué direcciones acepta como remitente (algunas rechazan casillas de webmail genérico) y su cuota gratuita diaria.
- El magic link es **best-effort**: sin SPF/DKIM propios el correo puede ir a spam o demorarse. Por eso Google es el login
  principal y la pantalla avisa que el email puede llegar a spam y tardar un minuto. Los jugadores deben mirar spam.
- Tener un dominio propio **solo** hace falta para autenticar el remitente con SPF/DKIM propios (mejor entrega); no es
  requisito para nada más del despliegue. Si se compra después, verificar el dominio en el proveedor y cambiar el remitente.

Después de configurarlo, probar enviando un magic link a una dirección que **no** sea la del OWNER y mirar también la carpeta de spam.

### d.4 Límites de frecuencia

*Authentication > Rate Limits* (los nombres/valores varían con el plan): revisar *emails enviados por hora*, *inicios de
sesión/registros por IP* y *verificaciones por IP*. Con SMTP propio el tope de correos por hora es configurable: ponerlo en un
valor acorde al grupo (decenas, no miles). Los valores de `supabase/config.toml` (`email_sent = 2`) son **solo locales**.

### d.5 Captcha con Cloudflare Turnstile (D5)

La app soporta Turnstile. Con `VITE_TURNSTILE_SITE_KEY` definida, la página de login carga el script de Cloudflare
(solo en esa ruta), muestra el widget (visible solo si Cloudflare necesita una interacción), deshabilita "Enviar link mágico"
hasta tener un token y lo envía como `options.captchaToken` en `signInWithOtp`. Sin la variable no hay widget ni token
(comportamiento anterior). "Continuar con Google" no usa captcha.

**Orden importante: configurar Vercel primero y activar el captcha en Supabase después.** Si se activa en Supabase antes de
desplegar la app con la site key, todos los inicios de sesión fallan (`captcha_failed`) hasta que se despliegue.

Pasos del OWNER:

1. **Cloudflare** (cuenta gratuita) > *Turnstile* > *Add widget*. Nombre libre; *Hostnames*: el dominio de producción
   (p. ej. `tu-proyecto.vercel.app` o tu dominio) y, si querés captcha en las previews, el dominio de las previews
   (los hostnames de las previews cambian por deploy y los dominios compartidos como `vercel.app` pueden no ser admitidos:
   **verificar en la doc de Cloudflare**; lo simple es dejar Preview sin `VITE_TURNSTILE_SITE_KEY`, y entonces el captcha de
   Supabase tampoco debe estar activo en el proyecto que usen las previews, D9). *Widget Mode*: **Managed**. Guardar y copiar la **Site Key** (pública) y la **Secret Key** (secreta).
2. **Vercel** > *Settings > Environment Variables*: `VITE_TURNSTILE_SITE_KEY` = la Site Key, en Production (y en Preview solo si
   el widget admite esos hostnames). Es pública (queda en el bundle). **Redeploy**: las `VITE_*` se hornean en el build.
3. **Supabase** > *Authentication > Attack Protection* (según la versión del dashboard: *Bot and Abuse Protection*) > activar
   *Enable CAPTCHA protection* > proveedor **Turnstile** > pegar la **Secret Key**. La clave secreta va **solo ahí**: nunca en
   Vercel, en el repo ni en una variable `VITE_*`.
4. Probar en el sitio desplegado: pedir un magic link (debe llegar el correo). En local el stack no usa captcha salvo que se
   active a propósito (ver el comentario de `[auth.captcha]` en `supabase/config.toml`, con las claves de PRUEBA de Cloudflare).
5. **CSP**: si se aplica la CSP de e.3, ver las directivas que Turnstile necesita.

Fallos que verá el usuario: si el script de Cloudflare no carga (bloqueador de contenido, sin red, o no responde en 10 s) el login queda bloqueado con un
mensaje y un botón "Reintentar" (no se omite el captcha). Si el token vence o falla, mismo mensaje con reintento. Si Supabase
rechaza el token, "La verificación de seguridad falló o venció".

Alcance verificado: contra GoTrue local con las claves de prueba de Cloudflare, con el captcha activo, `signInWithOtp` (magic
link) **sin token** responde HTTP 400 `captcha_failed` ("no captcha_token found") y **con token** HTTP 200 y el correo sale. Es decir,
el magic link **sí** está protegido. El captcha de Supabase **no** cubre `signInWithOAuth` (Google): el navegador va directo al
proveedor. La mitigación complementaria sigue siendo SMTP propio + límites de frecuencia (d.4) + decisión D6.

### d.6 Registro abierto, cerrado o por invitación (D6)

Estado actual: `shouldCreateUser: true`, registro abierto. Una persona con cualquier email puede crear cuenta, pero no
puede crear campañas (solo el Hub Owner, ver más abajo): puede *solicitar* hasta 3 campañas pendientes a la vez y unirse
a campañas existentes con un código de invitación. No ve datos de campañas ajenas (RLS), pero ocupa una fila de perfil
y envía correos de acceso desde tu SMTP.

#### Hub Owner: paso obligatorio ANTES de abrir el registro (H15)

El **Hub Owner** (vos) es el único que crea campañas directamente (queda como su DM) y el que aprueba o rechaza las
solicitudes (la campaña se crea con el *solicitante* como DM). No se envían correos: cada persona ve el estado en la
app («Mis solicitudes»). La lista de owners (`public.hub_owners`) **no se puede escribir desde la API**: se asigna una
sola vez, a mano, en *SQL Editor* de Supabase (rol `postgres`):

```sql
-- 1. Iniciá sesión en la app UNA vez (Google o magic link): esto crea tu usuario y tu perfil.
-- 2. Ejecutá, con tu email real (sin importar mayúsculas; el email debe estar confirmado):
insert into public.hub_owners (user_id)
select id from auth.users
where lower(email) = lower('<tu email>') and email_confirmed_at is not null;
-- 3. El editor debe responder `INSERT 0 1`. Si responde `INSERT 0 0`, el email no coincide, no existe
--    o no está confirmado: NO sigas, corregilo y repetí.
-- 4. Verificá (debe devolver 1 fila):
select u.email, h.created_at from public.hub_owners h join auth.users u on u.id = h.user_id;
```

Para quitar el privilegio: `delete from public.hub_owners where user_id = (select id from auth.users where email = '<email>');`.
**Orden obligatorio:** primero ejecutá el SQL de arriba (te asignás como owner) y **recién después** abrí el registro
(opción A o el aviso a los jugadores). Antes de ese paso nadie, ni siquiera vos, puede crear campañas.
Sin al menos un owner nadie puede crear campañas (el import usa la API de admin y no depende de esto). Si el email de
`--dm-email` del import es el tuyo, hacelo antes o después del import: es independiente. Los usuarios de `supabase/seed.sql`
(solo desarrollo local) incluyen a `dm@example.test` como owner con un UUID fijo y conocido
(`aaaaaaaa-0000-4000-8000-000000000001`): **el seed jamás debe llegar a una base alojada** (no ejecutar `supabase db reset`
ni `seed.sql` contra el remoto; el smoke check 7 de c.3 lo detecta). Si alguna vez llegó, borrar esa fila de `hub_owners`.

| Opción | Cómo | Costo |
|--------|------|-------|
| A. Abierto (por defecto) | no tocar nada; límites de d.4 | exposición a abuso de cuentas (las campañas ya requieren aprobación) |
| B. Cerrado | *Authentication > Sign In / Providers* > desactivar *Allow new users to sign up* | los jugadores deben existir antes: hay que invitarlos uno a uno desde *Authentication > Users > Invite user* **antes** de que usen el link de campaña. Rompe el flujo "mando un link y listo" |
| C. Gate por invitación real | *hook* `before user created` (Auth Hook) que compruebe un código | requiere código nuevo y despliegue de una función; **no implementado** |

Recomendación: A al inicio con SMTP propio y límites; pasar a B si se observa abuso. Nota: con B, el importer sigue funcionando
(crea el usuario del DM por la API de admin, que no depende del registro público).

### d.7 Google (D7, login principal)

La pantalla de login muestra «Continuar con Google» primero y, debajo de «o con tu email», el magic link. Pasos:

1. **Google Cloud Console** > crear (o elegir) un proyecto > *APIs & Services* > *OAuth consent screen*: tipo *External*, nombre de
   la app, correo de soporte y de contacto. Los scopes que usa Supabase (`openid`, `email`, `profile`) **no son sensibles**:
   no requieren verificación de Google.
2. *Credentials* > *Create credentials* > *OAuth client ID* > tipo **Web application**:
   - **Authorized JavaScript origins**: la URL de Vercel de producción (p. ej. `https://<proyecto>.vercel.app`, sin barra final;
     y la de staging/preview si aplica).
   - **Authorized redirect URIs**: `https://<ref>.supabase.co/auth/v1/callback` (el del proyecto Supabase, **no** el de la app).
3. **Estado de publicación de la pantalla de consentimiento**: *In production* o *Testing*.
   - *In production* (recomendado): cualquier cuenta de Google puede entrar.
   - *Testing*: solo entran los *test users* que agregues a mano. **No verifiqué** los límites del modo *Testing* (tope de
     usuarios de prueba, vencimiento de la autorización/tokens): confirmarlos en la documentación vigente de Google antes
     de apoyarte en ese modo para jugadores reales.
4. **Pantalla de consentimiento sin dominio propio**: Google muestra al usuario `<ref>.supabase.co` (el host del callback) como
   destino al que se le concede acceso, no un dominio tuyo. Es esperable; avisar a los jugadores.
5. **Supabase** > *Authentication > Sign In / Providers > Google*: activar; pegar *Client ID* y *Client Secret* (el secreto
   vive solo ahí y en el gestor de contraseñas).
6. **Vercel**: `VITE_AUTH_GOOGLE_ENABLED=true` (Production y Preview). Redeploy (las variables `VITE_*` se hornean en el build).
7. Probar con una cuenta Google que **no** sea la del OWNER, y también el magic link (mirando spam).

Si no se configura Google, definir `VITE_AUTH_GOOGLE_ENABLED=false` en Vercel: la pantalla queda solo con el formulario de email.

**Go/no-go (d):** login con Google completado con una cuenta ajena; magic link recibido (revisar spam) y completado en el mismo navegador.

---

## (e) Crear el proyecto Vercel

**[OWNER]** En <https://vercel.com/new>:

1. *Import Git Repository*: el repo de GitHub. Si el repo es de una cuenta personal, el plan Hobby basta para uso no comercial.
2. **Framework Preset**: *Vite*.
3. **Root Directory**: la raíz del repo.
4. **Build Command**: `npm run build` (= `vite build`). **Output Directory**: `dist`. **Install Command**: por defecto (`npm install`).
5. **Node.js Version** (*Settings > General*): 20.x (el workflow de GitHub Pages usa 20). El build solo ejecuta `vite build`.
6. **Production Branch** (*Settings > Git*): `feat/campaign-hub` mientras el corte no esté hecho. Razón: un push a `main`
   dispara `.github/workflows/deploy.yml`, que publica en GitHub Pages bajo `/DrakterimaWikiApp/` y con el `base: '/'` actual
   quedaría roto; `main` se mantiene intacto hasta retirar la app legacy (sección g).
7. **Environment Variables** — *antes del primer deploy*:

| Variable | Production | Preview | Valor |
|----------|:----------:|:-------:|-------|
| `VITE_SUPABASE_URL` | sí | sí | `https://<ref>.supabase.co` (Preview: el de staging si D9) |
| `VITE_SUPABASE_ANON_KEY` | sí | sí | clave anon/publishable (la del mismo proyecto) |
| `VITE_AUTH_GOOGLE_ENABLED` | sí | sí | `true` (Google es el login principal, D7); `false` oculta el botón |
| `VITE_TURNSTILE_SITE_KEY` | sí | opcional | Site Key **pública** de Turnstile (d.5). Sin ella no hay captcha en el login. La clave secreta NO va aquí |

**Nunca** definir en Vercel: la service role key, la URL de la base, la contraseña de la base, ninguna `VITE_DM_PASSWORD` /
`VITE_PLAYER_N_PASSWORD`, ni `VITE_FIREBASE_*`. Todo lo que empieza con `VITE_` queda **visible en el bundle público**.

La app legacy (`/legacy`) necesita `VITE_FIREBASE_*` y contraseñas legacy; **no se sirve desde Vercel**: sin esas variables
`/legacy` no funciona, y es lo deseado (la app legacy se mantiene en GitHub Pages hasta retirarla). Sin `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` toda la app muestra "Falta configurar Supabase" (`ConfigGate`).

8. **Deployment Protection** (*Settings > Deployment Protection*): dejar activa la *Vercel Authentication* para **Preview**;
   las previews ejecutan código de ramas arbitrarias contra la base configurada. Producción pública.
9. **Domains** (D8): agregar el dominio; actualizar luego Site URL y Redirect URLs (d.1), Google (d.7) y el `--app-origin` del import.
10. *Deploy*. Probar `https://<dominio>/login` y una ruta profunda (`/c/prueba/pnjs/3`): debe cargar la app (rewrite SPA), no un 404.

### e.1 Cómo se aplica `vercel.json` (ya en el repo, [AUTO])

```json
{ "rewrites": [{ "source": "/((?!assets/|favicon.svg).*)", "destination": "/index.html" }] }
```

- Toda ruta que no sea `/assets/*` ni `/favicon.svg` sirve `index.html` (deep links, `/c/:slug/...`, `/invite/:code`). Un
  `/assets/x.js` inexistente (chunk viejo tras un deploy) devuelve 404 real; la app lo detecta y recarga una vez
  (`RouteErrorScreen`, ver `src/app/README.md`).
- Headers en todas las rutas **excepto** `/invite/*`: `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`. En `/invite/*`: `Referrer-Policy: no-referrer` (el código de
  invitación va en la ruta y no debe filtrarse por `Referer`), más `nosniff` y `DENY`.
- Lo valida `src/app/vercelConfig.test.ts`.
- Revisión: no se encontró un defecto concreto; `vercel.json` queda sin cambios.

### e.2 Revisión de headers de seguridad

| Header | Estado | Comentario |
|--------|--------|------------|
| `X-Content-Type-Options: nosniff` | puesto | ok |
| `X-Frame-Options: DENY` | puesto | ok (equivalente a `frame-ancestors 'none'`) |
| `Referrer-Policy` | puesto (más estricto en `/invite/*`) | ok |
| `Strict-Transport-Security` | lo añade Vercel por defecto en HTTPS | verificar en la respuesta real (`curl -I`) |
| `Permissions-Policy` | **no puesto** | opcional: `camera=(), microphone=(), geolocation=()` (la app no usa esas APIs) |
| `Content-Security-Policy` | **no puesto** | propuesta abajo; **no está en `vercel.json`** |

### e.3 PROPUESTA de CSP (a probar; NO aplicada)

> Esto es una **propuesta**, no está en el repo ni verificada en un navegador contra el build alojado. Se despliega primero como
> `Content-Security-Policy-Report-Only`, se navega toda la app y se revisa la consola; solo cuando no haya violaciones se
> promueve a `Content-Security-Policy`.

Hechos del código que la sustentan (verificados en el repo):

- `dist/index.html` no tiene scripts inline: un `<script type="module" src="/assets/...">` externo. → `script-src 'self'`
  sin `'unsafe-inline'` es viable. Three.js y Leaflet no usan `eval` en la ruta que usa la app (no verificado en runtime).
- Estilos inline: ~50 archivos usan `style={...}` de React → `style-src` necesita `'unsafe-inline'` (o `style-src-attr`).
- Fuentes: `src/styles.css` hace `@import` de `fonts.googleapis.com` y `index.html` enlaza la hoja de Google Fonts; los
  archivos de fuente vienen de `fonts.gstatic.com`.
- Imágenes: logos, avatares e imágenes de mapa/entidades son URLs https **arbitrarias** que ponen los DM (`imagen_url`,
  `logo_url`); Leaflet usa `ImageOverlay` (sin tiles) y los pins son `divIcon`. → `img-src 'self' data: blob: https:`.
- Red: `supabase-js` habla con `https://<ref>.supabase.co` (REST/Auth) y `wss://<ref>.supabase.co` (Realtime). La app no
  llama a otros hosts (la página SRD de la app legacy usa open5e, pero en el hub la sección SRD es un placeholder).
- Turnstile (captcha del login, d.5): el script se carga de `https://challenges.cloudflare.com` (`script-src`), el widget es un
  iframe de ese origen (`frame-src`) y habla con él (`connect-src`). Si no se usa captcha, esas tres entradas sobran. No se
  verificó contra un navegador con CSP real: por eso se prueba primero en Report-Only.
- Login con Google: navegación completa al dominio de Google/Supabase (no hay iframes ni popups).

```text
default-src 'self';
script-src 'self' https://challenges.cloudflare.com;
frame-src https://challenges.cloudflare.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: https:;
connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co https://challenges.cloudflare.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none'
```

Cómo probarlo, sin tocar producción: en una rama aparte, agregar a `vercel.json` un header con
`"key": "Content-Security-Policy-Report-Only"` y el valor anterior en una sola línea (`<ref>` reemplazado), desplegar a Preview y
recorrer: login, hub, una campaña, mapas (imagen de mapa + pins), juegos (dado 3D), calendario, ajustes (logo https),
página de invitación. Si aparecen violaciones legítimas, ampliar la directiva correspondiente. Si se sirviera `/legacy`
habría que añadir los hosts de Firebase (no recomendado: ver la variable de entorno de legacy, más arriba en esta sección (e)).

Pendiente fuera de alcance: una política con `nonce` o sin `'unsafe-inline'` en estilos exigiría refactor de estilos.

---

## (f) Importar los datos legacy

Guía completa de comandos y banderas: [`scripts/import/README.md`](../scripts/import/README.md). Aquí solo el orden y las
reglas del corte. **Un import alojado requiere autorización explícita del OWNER para cada operación, incluido el dry run.**

### f.1 Reglas

1. **Export fresco, justo antes**: *Zona DM* de la app legacy > *Exportar JSON* (`drakterima-YYYY-MM-DD.json`). Guardarlo
   **fuera del repo** (o en `scripts/out/`, ignorado por git). Contiene `player_password` en texto plano y notas privadas del DM.
2. **App legacy congelada**: avisar a los jugadores, y (D13) poner las reglas de Firestore en solo lectura *antes* de exportar,
   para que no se escriba nada después del export.
3. **Ventana de calma**: sin escritores en el hub durante el import. Las secuencias de ids se avanzan sin bloqueo; un insert
   concurrente podría recibir un id repetido (ver h).
4. **Primero dry run** (transacción con ROLLBACK), revisar el reporte, **después** `--apply`.
5. Las **cinco condiciones** de un import alojado (si falta una, no conecta):
   1. bandera `--remote`;
   2. `IMPORT_ALLOW_REMOTE=<host>` en el entorno (autorización por operación);
   3. `--confirm-host <host>` con el mismo host, tipeado a mano;
   4. `SUPABASE_URL=https://<ref>.supabase.co`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_DB_URL` en el entorno;
   5. el host de `SUPABASE_DB_URL` pertenece al **mismo proyecto** (`db.<ref>.supabase.co`, o `*.pooler.supabase.com` con usuario
      `<rol>.<ref>`). Dominios personalizados de API se rechazan.
6. Ejecuta el **OWNER** en su máquina. Los secretos van por entorno, nunca como argumentos (quedarían en el historial).

### f.2 Pasos

**[OWNER]** En PowerShell, la sesión no debe guardar historial con secretos:

```powershell
Set-PSReadLineOption -HistorySaveStyle SaveNothing
```

Variables (una asignación por línea; reemplazar los marcadores; **no** pegar los valores en chat ni en archivos del repo):

```powershell
$env:SUPABASE_URL = 'https://<ref>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<service role key>'
$env:SUPABASE_DB_URL = '<cadena del pooler en modo sesión, con la contraseña>'
$env:IMPORT_ALLOW_REMOTE = '<ref>.supabase.co'
```

Dry run alojado (no deja filas: todo se revierte; muestra conteos y "rolled back". Las secuencias de tablas con ids generados, `entity_dm_notes` y `game_logs`, pueden avanzar aunque la transacción se revierta: solo deja huecos en los ids, nada más cambia):

```powershell
npm run db:import -- --remote --confirm-host <ref>.supabase.co --input C:\ruta\fuera\del\repo\export.json --dm-email <email-del-DM> --app-origin https://<dominio-de-producción> --lenient
```

Si el reporte es el esperado (conteos coherentes con el legacy, ver "Verify" del README del importer), aplicar:

```powershell
npm run db:import -- --remote --confirm-host <ref>.supabase.co --input C:\ruta\fuera\del\repo\export.json --dm-email <email-del-DM> --app-origin https://<dominio-de-producción> --lenient --apply
```

Código de salida `3` = los datos **ya están confirmados** pero falló un paso posterior (archivo de salida/conteos): repetir con
`--apply` regenera reporte y CSV; no duplica datos.

Limpiar las variables al terminar:

```powershell
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY, Env:SUPABASE_DB_URL, Env:IMPORT_ALLOW_REMOTE, Env:SUPABASE_URL
```

Recomendado antes del `--apply` real: ensayar todo el flujo en **staging** (D3) con un export real y borrar el resultado.
Opcional: snapshot previo de la base (`supabase db dump --linked -f backup.sql`, necesita Docker); en Free no hay backup automático.

### f.3 Invitaciones y reclamos

1. El import crea la campaña (`drakterima` salvo `--slug`), la membresía del DM, las entidades con **sus ids legacy** y una
   invitación **pendiente por personaje**. La salida es `scripts/out/invites-<slug>-<fecha>.csv` (códigos vivos; vigencia 90 días).
2. **Tratar el CSV como una lista de contraseñas**: en Windows el modo `0600` no se hace cumplir (NTFS); guardarlo en un disco
   cifrado, mandar a cada jugador **solo su link** por un canal privado y borrar el CSV al terminar.
3. Cada jugador: abre su link `https://<dominio>/invite/<código>` en el navegador donde va a usar la app, inicia sesión
   (magic link/Google) y **vuelve solo a la pantalla de la invitación** (el login recuerda el destino en `localStorage` por 30 min;
   si el magic link se abre en otro navegador no hay destino y cae en `/`: reabrir el link de la invitación), ve la pantalla de confirmación (con el aviso de que el DM ve su última conexión) y pulsa **Unirme**. Eso
   lo une a la campaña y lo hace dueño de su personaje.
4. El DM entra con el mismo email que pasó a `--dm-email` (el usuario se creó sin contraseña).
5. **Sync de datos de jugadores** (notas, lecturas, disponibilidad), repetible a medida que reclaman, mismas reglas de
   alojado (variables + `--remote` + `--confirm-host`), primero dry run:

```powershell
npm run db:import -- --sync-claims --remote --confirm-host <ref>.supabase.co --input C:\ruta\fuera\del\repo\export.json --slug drakterima --lenient
```

```powershell
npm run db:import -- --sync-claims --remote --confirm-host <ref>.supabase.co --input C:\ruta\fuera\del\repo\export.json --slug drakterima --lenient --apply
```

Dejar de correrlo cuando todos hayan reclamado (una nota que el jugador borre en el hub reaparece en el siguiente sync).

**Go/no-go (f):** conteos post-apply (`db.postApplyCounts` del reporte) iguales a los del legacy; enlaces wiki resuelven; todos
los personajes tienen invitación; CSV guardado y luego borrado.

---

## (g) Cutover

### g.0 Principio

La app legacy (GitHub Pages + Firestore) **sigue funcionando sin cambios** hasta el punto de no retorno. `main` no se toca
hasta la fase de retiro. `.github/workflows/deploy.yml` no se modifica antes.

### g.1 Checklist ordenado

| # | Fase | Quién | Gate |
|---|------|-------|------|
| 0 | Decisiones D1..D13 resueltas; suite local en verde (a) | OWNER | **GO 0** |
| 1 | Crear Supabase (b), link y `db push` (c.1, c.2) | OWNER | **GO 1**: 15 migraciones aplicadas |
| 2 | Smoke checks SQL (c.3) y chequeo Realtime (c.4) | OWNER | **GO 2**: todo PASA |
| 3 | Auth: URL config, SMTP, límites, (Google) (d); **asignarte como Hub Owner (d.6)** antes de abrir el registro | OWNER | **GO 3**: magic link llega a un correo ajeno; `select ... from hub_owners` devuelve tu email |
| 4 | Vercel: proyecto, variables, dominio, previews protegidas (e) | OWNER | **GO 4**: `/login` y un deep link cargan; sin "Falta configurar Supabase" |
| 5 | CSP en Report-Only en una preview (e.3), opcional | OWNER | informativo |
| 6 | Ensayo en staging con export real (f), opcional | OWNER | **GO 6**: conteos coherentes |
| 7 | Aviso a jugadores; congelar legacy y Firestore en solo lectura; export fresco (f.1) | OWNER | **GO 7**: nadie escribe en legacy |
| 8 | Dry run y apply del import alojado (f.2) | OWNER | **GO 8**: reporte coherente |
| 9 | Verificación como DM (g.2) | OWNER | **GO 9**: todo OK |
| 10 | Repartir invitaciones; jugadores reclaman; sync-claims (f.3) | OWNER + jugadores | **GO 10**: todos reclamaron |
| 11 | Período de observación (p. ej. 2 semanas) con legacy congelado y disponible | OWNER | sin incidentes |
| 12 | Retiro de la app legacy (g.4) | OWNER | irreversible: tras el GO 11 |

**Punto de no retorno:** el primer cambio de un jugador en el hub (fase 10 en adelante). Antes de eso, el rollback es total.

### g.2 Verificación posterior al import (en producción)

**[OWNER]** como DM, y con un segundo usuario jugador (navegador distinto):

- [ ] Login por magic link (mismo navegador) y, si aplica, Google.
- [ ] *Mis campañas* muestra Drakterima con rol DM; el jugador ve el suyo con rol Jugador.
- [ ] Aceptar una invitación de prueba (abrir el link no la consume; solo **Unirme**) y que el personaje quede a nombre del jugador.
- [ ] Realtime: editar un PNJ como DM y verlo cambiar sin recargar en el otro navegador.
- [ ] Conteos por sección = reporte del import (sesiones, PJ, PNJ, lugares, facciones, lore, ítems, mapas, puntos).
- [ ] Wiki-links `[[{3G}...]]` navegan; los colgantes figuran en el reporte.
- [ ] Mapas: imagen, pins, click-to-place (como DM), pin `borrador` solo visible para el DM.
- [ ] Visibilidad: un `secreto` compartido con un PJ lo ve solo ese jugador; un `borrador` no lo ve ningún jugador.
- [ ] Juegos: tirada de lotería de un jugador (una por día UTC), pozo, asignación de monedas del pozo al PJ.
- [ ] Calendario y disponibilidad; notas de jugador; pantalla *Sesión en vivo* (DM).
- [ ] *Ajustes*: nombre/logo/color de la campaña, regiones, campos de personaje, invitaciones, jugadores.
- [ ] `curl -I https://<dominio>/c/x` muestra los headers de `vercel.json`; `/invite/x` con `Referrer-Policy: no-referrer`.

### g.3 Rollback

| Momento | Qué hacer |
|---------|-----------|
| Antes de la fase 7 | Nada que revertir en legacy. Si Vercel/Supabase fallan, corregir o pausar; los jugadores siguen en GitHub Pages. |
| Fases 7 a 9 (nadie usó el hub) | Descongelar: devolver las reglas de Firestore a las anteriores, avisar. El import es idempotente: se puede borrar la campaña desde *Ajustes > Zona de peligro* (escribir el slug) y el usuario DM huérfano desde *Authentication > Users*, y repetir. |
| Fase 10 en adelante | Hay escrituras de jugadores solo en el hub; **no existe export hub → Firestore**. Rollback = abandonar esas escrituras (el legacy congelado conserva el estado del corte). Por eso hay período de observación (fase 11) y el legacy no se retira antes. |
| Falla del frontend | Vercel > *Deployments* > *Promote to Production* sobre el deploy anterior (instantáneo). |
| Falla de una migración | Las migraciones no tienen "down"; corregir hacia adelante con una migración nueva. Restaurar backup solo en plan con backups (Pro). |

**DNS / URLs:** la URL vieja (`github.io/DrakterimaWikiApp`) y la nueva conviven hasta el retiro. Si hay dominio propio, no
mover su DNS al nuevo hasta el GO 9; si se usa `*.vercel.app`, no hay DNS que tocar. Al retirar, la URL vieja deja de
existir o muestra una página de redirección (D12): GitHub Pages no puede redirigir a otro dominio sin publicar una página
estática con `<meta http-equiv="refresh">` y un enlace.

### g.4 Retirar la app legacy

Solo tras el GO 11. **[OWNER]** salvo donde diga otra cosa.

1. **Secretos de GitHub** (*Settings > Secrets and variables > Actions*): borrar los de contraseñas legacy y de Firebase
   (una orden para todos; requiere `gh` autenticado):

```powershell
'VITE_DM_PASSWORD','VITE_PLAYER_1_PASSWORD','VITE_PLAYER_2_PASSWORD','VITE_PLAYER_3_PASSWORD','VITE_PLAYER_4_PASSWORD','VITE_PLAYER_5_PASSWORD','VITE_PLAYER_6_PASSWORD','VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_STORAGE_BUCKET','VITE_FIREBASE_MESSAGING_SENDER_ID','VITE_FIREBASE_APP_ID' | ForEach-Object { gh secret delete $_ }
```

2. **Contraseñas legacy: retirar/rotar.** Las 6 contraseñas de jugadores y la del DM están en el **historial de git** (el
   archivo `data/db.json` se versionó antes de `bb067a8`) y dentro del **bundle público** de la app legacy desplegada
   (`VITE_*_PASSWORD`). Se considera que son de conocimiento público. Pasos: (a) borrar los secretos (arriba) y la app que las
   usa (paso 4); (b) pedir a los jugadores y al DM que **cambien cualquier otra cuenta en la que hayan reutilizado esa
   contraseña**; (c) no hay reescritura del historial: la rotación significa que esas contraseñas dejan de proteger algo. El
   hub no usa contraseñas (magic link/Google).
3. **Firestore**: poner las reglas en `allow read, write: if false;` y, pasado un tiempo prudente, eliminar la base o el
   proyecto de Firebase (consola de Firebase; el cierre de proyecto es recuperable por un plazo). Antes, guardar el último
   export **cifrado y fuera del repo** (contiene contraseñas en texto plano y notas privadas) o borrarlo.
4. **GitHub Pages**: en el PR final a `main`, **borrar `.github/workflows/deploy.yml`** (si no, cada push a `main` intentaría
   publicar el hub bajo `/DrakterimaWikiApp/` con `base: '/'`) y despublicar el sitio:

```powershell
gh api -X DELETE repos/<dueño>/<repo>/pages
```

   (o *Settings > Pages* > *Unpublish*; o reemplazar el artefacto por una página estática de redirección, D12).
5. **Vercel**: cambiar *Production Branch* a `main` tras el merge de `feat/campaign-hub` a `main`.
6. **Seguimiento de código** (no es parte de esta guía, queda como tareas): quitar `src/App.jsx`, `src/pages/*` legacy,
   `src/firebase.js`, la ruta `/legacy/*` y la dependencia `firebase`; actualizar `CLAUDE.md`.
7. Borrar de `.env.local` locales las variables `VITE_FIREBASE_*` y de contraseñas.

---

## (h) Riesgos residuales

Conocidos y aceptados al momento de escribir esto; no se ocultan.

| Riesgo | Detalle / mitigación |
|--------|----------------------|
| Sin límite de frecuencia en `preview_invite` | Cualquier usuario autenticado puede sondear códigos de invitación. Los códigos son largos y aleatorios; la respuesta no devuelve datos en estados de error. Mitigación futura: límite por usuario/IP. |
| Guarda "región en uso" solo en el cliente | Impide quitar una región usada por lugares/PNJ/PJ/facciones desde la UI, pero no es una restricción de base de datos. |
| Inmutabilidad del slug solo en la UI | La base no impide cambiarlo por API a un DM malicioso/descuidado: se rompen enlaces compartidos. |
| Carrera de secuencias en el import | `setval` sin bloqueo: solo seguro en **ventana de calma** (legacy congelado, sin escritores en el hub). Hay que respetarlo. |
| El host del logo ve la IP de quien abre la campaña | El logo (y avatares) son URLs https externas puestas por el DM; los navegadores de todos los miembros las piden. Se mantiene `referrerPolicy="no-referrer"`. |
| Borrado de campaña permanente | `delete_campaign` no tiene papelera ni auditoría; otras pestañas abiertas ven errores de carga. |
| Registro abierto; las campañas requieren aprobación del Hub Owner (tope de 3 solicitudes pendientes por usuario) | Ver (d.6). |
| Google OAuth no pasa por el captcha (el captcha de Supabase cubre el magic link, no `signInWithOAuth`) | Ver (d.5), D6 y límites de frecuencia. |
| Enlaces de magic link ligados al navegador (PKCE) y consumibles por filtros de correo | Avisar a los jugadores; pedir otro enlace. |
| Sin CSP | Propuesta en e.3. |
| Notas/disponibilidad borradas en el hub reaparecen en el siguiente `--sync-claims` | Dejar de correrlo al terminar. |
| `visible_to` en Realtime depende del servidor alojado | Se verifica en c.4; repetir tras cambios mayores de Supabase. |
| Datos de `entity_dm_notes` y claves de servicio | Las notas del DM no se publican en Realtime; la service role key nunca debe salir de la shell del OWNER. |

---

## Tabla de secretos y variables

| Nombre | Dónde vive | ¿Público o secreto? |
|--------|------------|---------------------|
| `VITE_SUPABASE_URL` | Vercel (Production/Preview), `.env.local` local | Público (va en el bundle) |
| `VITE_SUPABASE_ANON_KEY` | Vercel (Production/Preview), `.env.local` local | Público por diseño (RLS es el límite) |
| `VITE_AUTH_GOOGLE_ENABLED` | Vercel, opcional local | Público (bandera) |
| `VITE_TURNSTILE_SITE_KEY` | Vercel, opcional local | Público (la *site key* de Turnstile) |
| Contraseña de la base de datos | gestor de contraseñas; la pide `supabase link`/`db push` (o `SUPABASE_DB_PASSWORD`) | **Secreto** |
| `SUPABASE_ACCESS_TOKEN` (login de la CLI) | máquina del OWNER (`supabase login`) | **Secreto** |
| `SUPABASE_SERVICE_ROLE_KEY` | solo la shell del OWNER durante el import | **Secreto** (nunca Vercel/GitHub/repo) |
| `SUPABASE_DB_URL` (con contraseña) | solo la shell del OWNER durante el import | **Secreto** |
| `SUPABASE_URL` | shell del OWNER durante el import | No secreto |
| `IMPORT_ALLOW_REMOTE` | shell del OWNER durante el import | No secreto (es la autorización por operación) |
| `IMPORT_OUT_DIR` | shell, opcional | No secreto |
| Client ID / Client Secret de Google | Google Cloud + Supabase (dashboard) | ID no secreto; **Secret: secreto** |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` | solo `supabase/.env` local (ignorado por git), para la pila local | **Secreto** |
| Credenciales SMTP | Supabase (dashboard) | **Secreto** |
| Clave secreta de Turnstile | Supabase (dashboard, *Attack Protection*) y, solo para la pila local de prueba, `SUPABASE_AUTH_CAPTCHA_SECRET` en el entorno/`supabase/.env` (clave de PRUEBA de Cloudflare) | **Secreto** (la *site key* es pública) |
| `VITE_FIREBASE_*` (6) | GitHub Secrets del workflow legacy | Configuración de cliente de Firebase (no secreta en sí), **a retirar** |
| `VITE_DM_PASSWORD`, `VITE_PLAYER_1..6_PASSWORD` | GitHub Secrets del workflow legacy | **Comprometidas** (están en el bundle público legacy y en el historial). **A retirar** (g.4) |

### Qué debería tener `.env.example`

No se pudo leer `.env.example` (protegido). Debe documentar, como mínimo, para desarrollo local:

```text
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<salida de `supabase status`>
VITE_AUTH_GOOGLE_ENABLED=false
# Opcional: vacío = sin captcha. Clave de PRUEBA de Cloudflare (siempre pasa): 1x00000000000000000000AA
# (solo tiene efecto si la pila local tiene el captcha activo, ver supabase/config.toml)
VITE_TURNSTILE_SITE_KEY=
```

El resto (Firebase, contraseñas legacy) solo hace falta para correr `/legacy` en local. Los secretos de importación
(`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `IMPORT_ALLOW_REMOTE`) **no** deben figurar en ningún archivo `.env`.
