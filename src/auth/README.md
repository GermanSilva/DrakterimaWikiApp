# `src/auth`: Supabase Auth for the hub

Additive (the Firebase app and its password modal are untouched). H6 mounts it in the router/shell.

```
authConfig.ts          AUTH_CALLBACK_PATH, callbackUrl(), isGoogleEnabled(), turnstileSiteKey()
authErrors.ts          AuthFlowError (invalid_email | rate_limited | provider_disabled | captcha_failed | network | unknown), normalizeEmail
authActions.ts         requestMagicLink(client, email, { captchaToken?, origin? }), startGoogleSignIn(client)   (pure, client injected)
turnstile/             turnstileLoader.ts (script loaded once, lazily), useTurnstile.ts (widget + token hook), fakeTurnstile.ts (tests)
AuthProvider.tsx       <AuthProvider client? profiles?> + useAuth(): { status, session, user, profile, profileError, profileStatus,
                       signInWithEmail, signInWithGoogle, signOut, refreshProfile }
completeAuthCallback.ts / AuthCallback.tsx   finish the sign-in at /auth/callback, then onDone('/')
LoginPage / UserMenu / ProfileForm           presentational (props only); ConnectedLoginPage wires LoginPage to useAuth
RequireAuth.tsx        children when signed in, loading element, fallback (default: login page)
```

Usage: `<AuthProvider><RequireAuth>...</RequireAuth></AuthProvider>`; render `<AuthCallback onDone={navigate} />`
at `/auth/callback`. The provider uses `getSupabase()` unless a client is passed (tests, `setSupabaseClient`).

## Flow

1. Magic link: `signInWithOtp({ email, emailRedirectTo: <origin>/auth/callback, shouldCreateUser: true })`.
   Locally the email lands in Mailpit (http://127.0.0.1:54324).
2. The link goes through GoTrue and redirects to `/auth/callback?code=...` (PKCE). The shared client is created with
   `flowType: 'pkce'` and `detectSessionInUrl: false`, so `completeAuthCallback` is the single owner of the URL: it wipes
   query and fragment with `history.replaceState` before any await, then calls `exchangeCodeForSession(code)`. Success is
   reported only if that exchange returned a session (an existing session never vouches for a bad link). A fragment with
   `access_token`/`refresh_token` is rejected, so a crafted token link cannot sign anyone in. Callback outcomes (same classifier for returned and thrown
   exchange errors; logged as name/status/code only): **network** (fetch failure or 5xx), **wrong browser** (missing code verifier),
   **expired** (invalid/expired/used code, or a provider error of that kind), **rate-limited** (429), **cancelled** (provider
   access_denied), **generic** (anything else, incl. a fragment with tokens or a URL that cannot be cleaned), **timeout** (15 s,
   error screen with a way out) and **late success** (exchange finished after the timeout: "Ya iniciaste sesión" with a Continuar
   button, never an automatic navigation).
   Server error text is never shown; the UI uses fixed Spanish messages.

   **Same-browser limitation:** the code verifier lives in the browser storage that requested the link, so the link must be
   opened in that same browser (the login screen says so). Opening it elsewhere fails with a friendly message.
3. `onAuthStateChange` feeds the provider; the profile is loaded through `profileRepository` for the user id.
   The `profiles` row is created by the `handle_new_user` trigger.

`onDone` always receives `'/'`: there is deliberately no caller-controlled `next` parameter (no open redirect).
`redirectTo` is built from `window.location.origin` only and Supabase additionally allow-lists it.

## Configuration

- `/auth/callback` must be listed in `supabase/config.toml` `additional_redirect_urls` (localhost and 127.0.0.1
  are there) and, on a hosted project, in Authentication > URL Configuration for every deployed origin.
- `VITE_AUTH_GOOGLE_ENABLED=false` hides the Google button (anything else shows it; set it to `true` explicitly in Vercel).
- **Login layout (Google first).** Google is the primary sign-in (product decision: no own domain, so the magic link is
  best-effort and may land in spam). With Google enabled `LoginPage` renders, in order: the prominent "Continuar con Google"
  button, a divider "o con tu email", the email form (Turnstile widget + the secondary "Enviar link mágico" button) and a short
  note that the email can arrive in spam and take a minute. With Google disabled the page is the email form alone, exactly as before.
  Turnstile gates only the magic-link submit; the Google button never waits for a token.
- `VITE_TURNSTILE_SITE_KEY` (public) turns on the Cloudflare Turnstile captcha at login; unset or blank = no widget, no token
  (local dev, tests). When set, `LoginPage` renders the widget (`useTurnstile`: explicit render, dark theme, `es`, appearance
  `interaction-only`), keeps "Enviar link mágico" disabled until there is a token, sends it as `options.captchaToken` of
  `signInWithOtp` and resets the widget after every attempt (tokens are single use). The script
  (`https://challenges.cloudflare.com/turnstile/v0/api.js`, `async defer`, one tag) is injected only when the login page
  mounts with a site key. If it cannot load (blocked, offline, or no response within 10 s) or the widget cannot render, login stays blocked with a retry (it never silently skips the captcha). Token expiry
  or widget errors show a Spanish message with "Reintentar". The token is never logged. Google OAuth takes no token.
  The secret key lives only in Supabase (Authentication > Attack Protection); see `docs/hosting-and-cutover.md` d.5 and the
  commented `[auth.captcha]` block in `supabase/config.toml` (local test keys).
- Verified against the local GoTrue with captcha enabled: a magic-link request without token gets 400 `captcha_failed`, with
  the Turnstile test token it gets 200 (so `signInWithOtp` IS covered by the captcha setting; OAuth is not).
- Google OAuth (disabled locally): supabase-js only builds the authorize URL, so `startGoogleSignIn` asks for it with
  `skipBrowserRedirect`, probes it once (no redirect followed) and shows a friendly message when the provider is off.
  The probe can read the error only when GoTrue answers with CORS headers; otherwise it cannot tell and navigation proceeds
  (the user would then see the raw provider error page).

## Enabling Google later

1. Google Cloud Console > APIs & Services > Credentials > OAuth client ID (Web application).
2. Authorized redirect URI: `<supabase url>/auth/v1/callback` (local: `http://127.0.0.1:54321/auth/v1/callback`).
3. Local: put `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in `supabase/.env`
   (gitignored), set `[auth.external.google] enabled = true` in `supabase/config.toml`, restart `supabase start`.
   Hosted: configure the provider in the dashboard.
4. Never commit the secret.

## Tests

- Unit: `npm test` (fake auth client in `testing/fakeAuth.ts`).
- Profile state: `profileStatus` is idle | loading | loaded | error. After a failed refresh `profile` keeps the last
  known value while `profileError` explains the failure. Only the latest profile read may write state.
- Integration: `npm run test:integration` (`src/data/integration/auth.integration.test.ts`) requests a real magic link,
  reads it from Mailpit (URL from `supabase status`), follows it (GoTrue answers 302 or 303; both accepted) to `/auth/callback?code=`, proves another client cannot exchange it,
  completes `completeAuthCallback` with the requesting client, checks the session and the profile row, rejects a crafted
  `#access_token` URL, then deletes the user and the emails.
- Profile caps are enforced by the database too (migration `20261007120000_profile_caps`, pgTAP `05_profile_caps`).
