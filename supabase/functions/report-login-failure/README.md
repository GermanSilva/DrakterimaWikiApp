# report-login-failure

Edge Function that stores an anonymous "Google sign-in failed/disabled" report in `login_failure_reports`
and emails the owner through Resend. Contract: `odd/tasks/login-failure-report.md`.

## Function environment variables

Set them on the hosted project (never in the repo or in `VITE_*`):

| Name | Purpose |
| --- | --- |
| `REPORT_TO_EMAIL` | recipient of the report email |
| `RESEND_API_KEY` | Resend API key |
| `REPORT_IP_SALT` | salt for the SHA-256 IP hash used by the rate limits |
| `REPORT_ALLOWED_ORIGINS` | comma-separated origins allowed by CORS |
| `REPORT_FROM_EMAIL` | optional sender; defaults to `RPG Quester <onboarding@resend.dev>` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically. If `RESEND_API_KEY` or `REPORT_TO_EMAIL`
is missing, the report is still stored (the email step fails and is logged).

## Deploy

```bash
supabase functions deploy report-login-failure --no-verify-jwt
```

Tests: `npx vitest run supabase/functions` (the handler is pure TypeScript; `index.ts` is Deno-only).
