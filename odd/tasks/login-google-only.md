# login-google-only

Login del hub solo con Google (sin magic link ni Turnstile en el cliente) y, al llegar desde una invitación, vista previa
de la campaña antes de iniciar sesión. Spec visual: `design/login-google-only/03-invitacion-contextual.html`.

## Specs

- S1 (L1, L2): "quitando el ingreso por magic link" — el login no ofrece ingreso por email; solo "Continuar con Google".
- S2 (L3, L5): "Quitarlo del cliente (Recomendado)" — se borran del cliente Turnstile (`src/auth/turnstile`, `VITE_TURNSTILE_SITE_KEY`, `turnstileSiteKey`, el `captchaToken` de `requestMagicLink`/`signInWithEmail`) y sus tests; se actualizan docs. L5: "Email solo en desarrollo (Recomendado)" — "Producción: solo Google. En `npm run dev` (import.meta.env.DEV) aparece un formulario \"Ingreso de desarrollo\" con magic link, sin Turnstile; Vite lo elimina del build. Turnstile se quita igual." Deshabilitar el proveedor Email en Supabase alojado queda como paso manual del owner.
- S3 (L3): "RPC anónima nueva, datos mínimos (Recomendado)" — migración con `preview_invite_public(code)` ejecutable por anon: nombre, logo, color, lema, vencimiento. Sin nombre del DM ni conteo. pgTAP incluido. Errores sin datos de la campaña (mismos estados que `accept_invite` para un no miembro).
- S4 (L3): banner: "Debería ser el banner que se aplica al panel" — la vista previa usa `branding.banner_url` (el banner del panel) como fondo sutil del bloque de la campaña; sin banner, fondo liso.
- S5 (L4): con `next=/invite/:code`, el login muestra "Te invitaron a" + campaña, título "Ingresá para unirte", los pasos siguientes y un error que aclara que la invitación no se pierde; sin invitación (o si la vista previa falla), login genérico "Ingresar". Estados Redirigiendo y Error como en el artboard.

## Tasks

- T1 [S3, S4] inline — migración `preview_invite_public` + pgTAP + tipos + repositorio/hubData. commit: 945149a
- T2 [S1, S2] worker — quitar Turnstile; magic link solo en desarrollo; tests y docs. commit: 7bef166 (el form de dev todavía queda en el bundle: se extrae en T3)
- T3 [S2, S4, S5] worker — LoginPage rediseñado con vista previa de invitación; form de dev extraído (no queda en dist). commit: (ver abajo)

## Log

- L1: "Analiza el login y haz propuestas de diseños de login, quitando el ingreso por magic link."
- L2: Handoff: "Implement the design artboard design/login-google-only/03-invitacion-contextual.html" (comentarios aplicados: fondo de la opción 2; banner de campaña como fondo sutil del bloque de invitación).
- L3: Decisiones del owner: vista previa = "RPC anónima nueva, datos mínimos (Recomendado)"; banner = "Debería ser el banner que se aplica al panel"; Turnstile = "Quitarlo del cliente (Recomendado)".
- L5: Bloqueo: en local Google está deshabilitado (config.toml) y el seed es solo magic link. Decisión del owner: "Email solo en desarrollo (Recomendado)".
- L4: Diseño `design/login-google-only/` (01-focal-minimo, 02-portada-dividida, 03-invitacion-contextual). Elegido: 03-invitacion-contextual; 01 y 02 quedan como alternativas.
- L6: Verificación visual local (Vite contra Supabase local, 1440 y 360 px): modo invitación con logo/inicial, banner sutil, acento de campaña, pasos y vencimiento; modo genérico con degradé de marca. Contra staging la RPC devuelve 404 (migración no desplegada) y el login cae al modo genérico, como se espera.
