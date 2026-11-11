# login-failure-report

Si el ingreso con Google falla o está deshabilitado, cualquier visitante (sin sesión) puede reportarlo desde el login y
al owner le llega un mail. Envío por Supabase Edge Function + Resend; el reporte también queda guardado en una tabla.

## Specs

- S1 (L1): "Para el caso de que Google quede deshabilitado, me gustaría que cualquier usuario tenga la posibilidad de reportar el fallo." — el login ofrece «Reportar el problema» cuando Google está deshabilitado (`googleEnabled` false) o cuando el intento con Google terminó en error. Sin sesión.
- S2 (L1, L2): "El sistema podría enviarme un mail así yo me entero y me encargo del problema." — "Edge Function + Resend (Recomendado)": «Botón «Reportar el problema» en el login (cuando Google falla o está deshabilitado), con email de contacto opcional y descripción. Una Supabase Edge Function guarda el reporte en una tabla y te manda el mail con Resend (gratis hasta 3000/mes). Límite por IP y por día. Necesitás crear cuenta en Resend y darme la API key como secreto de Supabase (yo no la leo: la cargás vos).»
- S3 (L2): protección anti-abuso: límite por IP y por día; el destinatario y la API key viven solo como secretos de la función (`REPORT_TO_EMAIL`, `RESEND_API_KEY`), nunca en `VITE_*` ni en el repo; la tabla no es legible ni escribible por `anon`/`authenticated` (solo service role).

### Contrato de la función `report-login-failure` (definido por el parent)

`POST /functions/v1/report-login-failure`, JSON:
`{ kind: 'google_disabled' | 'google_error', errorKind?: string (<=64, [a-z_]), message?: string (<=1000), contact?: string (email <=254), path?: string (<=200, empieza con "/"), website?: string (honeypot) }`.
Respuestas: `202 {"ok":true}` (guardado; el mail se intenta y su fallo no cambia la respuesta), `400 {"error":"invalid_input"}`,
`429 {"error":"rate_limited"}`, `405`, `500 {"error":"unavailable"}`. Honeypot no vacío → `202` sin guardar ni enviar.
Límites: 3 por IP (hash SHA-256 con sal `REPORT_IP_SALT`) por hora y 30 en total por día. CORS solo para `REPORT_ALLOWED_ORIGINS`
(lista separada por comas). `verify_jwt = false`.

## Tasks

- T1 [S2, S3] worker — migración `login_failure_reports` + pgTAP + Edge Function (handler puro testeado con vitest) + config. commit: 808e9b2
- T2 [S1, S2] worker — UI en LoginPage + data layer (`reportLoginFailure`) + tests. commit: 84bd26f (honeypot corregido por el parent: envía el valor real)
- T3 [S2, S3] inline — deploy a staging (db push + functions deploy) y docs del runbook; secretos los carga el owner. commit: deploy remoto (sin commit de código)

## Log

- L1: "Fijemos la zona horaria a Argentina. Para el caso de que Google quede deshabilitado, me gustaría que cualquier usuario tenga la posibilidad de reportar el fallo. El sistema podría enviarme un mail así yo me entero y me encargo del problema."
- L2: Decisión del owner: "Edge Function + Resend (Recomendado)".
- L3: Zona horaria resuelta aparte (9faf9d6, feature login-google-only).
- L4: Review RDD 9faf9d6..84bd26f (review-0304a8f390f9cc5e, lentes risk/resilience/reliability): aprobado y quemado; hallazgos informativos. Aplicados por el parent: timeout de 8 s al llamar a Resend y la función se niega a correr sin `REPORT_IP_SALT` (16+ caracteres). Quedan como mejoras: la IP sale de `x-forwarded-for` (falsificable, así que el límite por IP es orientativo; el tope diario global sigue firme), conteo y alta no atómicos, sin reintento del mail (el reporte igual queda en la tabla).
- L5: Owner creó cuenta Resend y cargó los secretos; autorizó "Sí, desplegá y probá". `supabase db push` aplicó 20261112120000_login_failure_reports.sql en drakterima-staging; `supabase functions deploy report-login-failure --no-verify-jwt` OK. Prueba real: POST con Origin http://localhost:5173 → 202 {"ok":true} y CORS correcto. Llegada del mail: confirmada por el owner (asunto, campos y hora de Buenos Aires correctos). Feature cerrada.
