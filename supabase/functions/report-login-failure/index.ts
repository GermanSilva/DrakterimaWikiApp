// Deno entry point: wires the pure handler to Supabase (service role) and Resend.
// Configuration comes from function environment variables; see README.md. Never log or return their values.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler } from './handler.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (req: Request) => Promise<Response>): void
}

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
})

const allowedOrigins = (Deno.env.get('REPORT_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode((Deno.env.get('REPORT_IP_SALT') ?? '') + ip)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(
  createHandler({
    allowedOrigins,
    now: () => new Date(),
    hashIp,
    async insertReport(row) {
      const { data, error } = await supabase.from('login_failure_reports').insert(row).select('id').single()
      if (error || !data) throw new Error(`insert failed: ${error?.code ?? 'unknown'}`)
      return { id: data.id as number }
    },
    async countRecent(ipHash, sinceIso) {
      const { count, error } = await supabase
        .from('login_failure_reports')
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gte('created_at', sinceIso)
      if (error) throw new Error(`count failed: ${error.code ?? 'unknown'}`)
      return count ?? 0
    },
    async countSince(sinceIso) {
      const { count, error } = await supabase
        .from('login_failure_reports')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sinceIso)
      if (error) throw new Error(`count failed: ${error.code ?? 'unknown'}`)
      return count ?? 0
    },
    async markEmailed(id) {
      const { error } = await supabase.from('login_failure_reports').update({ emailed: true }).eq('id', id)
      if (error) throw new Error(`update failed: ${error.code ?? 'unknown'}`)
    },
    async sendEmail({ subject, text, replyTo }) {
      const apiKey = Deno.env.get('RESEND_API_KEY')
      const to = Deno.env.get('REPORT_TO_EMAIL')
      if (!apiKey || !to) throw new Error('email not configured')
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: Deno.env.get('REPORT_FROM_EMAIL') ?? 'RPG Quester <onboarding@resend.dev>',
          to: [to],
          subject,
          text,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      })
      if (!res.ok) throw new Error(`resend responded ${res.status}`)
    },
  }),
)
