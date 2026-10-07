# `src/auth`: Supabase Auth for the hub

Additive (the Firebase app and its password modal are untouched). H6 mounts it in the router/shell.

```
authConfig.ts          AUTH_CALLBACK_PATH, callbackUrl(), isGoogleEnabled()
authErrors.ts          AuthFlowError (invalid_email | rate_limited | provider_disabled | network | unknown), normalizeEmail
authActions.ts         requestMagicLink(client, email), startGoogleSignIn(client)   (pure, client injected)
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
   `access_token`/`refresh_token` is rejected, so a crafted token link cannot sign anyone in. Exchange failures are classified (network/5xx, missing
   verifier, invalid/expired/used) and logged as name/status/code only; the callback gives up after 15 s with a way out.
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
- `VITE_AUTH_GOOGLE_ENABLED=false` hides the Google button (anything else shows it).
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
