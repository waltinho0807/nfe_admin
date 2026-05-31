// lib/turnstile.ts
//
// Validação server-side do Cloudflare Turnstile (anti-spam).
// Segue o mesmo padrão de lib/hotmart.ts: funções puras, lê env var.
//
// O fluxo:
//   1. Cliente resolve o widget no navegador → gera um token
//   2. Token vai junto no POST do formulário
//   3. AQUI validamos esse token com a Cloudflare usando a SECRET KEY
//   4. Se válido → é humano. Se inválido → bot/expirado.

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export interface TurnstileResult {
  success: boolean
  // motivo da falha, quando houver (pra log)
  reason?: string
}

/**
 * Valida o token do Turnstile com a Cloudflare.
 *
 * Comportamento quando NÃO há secret configurada:
 *   - Retorna { success: true } com aviso no log.
 *   - Isso permite o formulário funcionar em dev / antes de configurar.
 *   - Em produção, configure TURNSTILE_SECRET_KEY pra ativar a proteção.
 *
 * @param token  o token gerado pelo widget no navegador
 * @param ip     ip do cliente (opcional, melhora a validação)
 */
export async function validarTurnstile(
  token: string | null | undefined,
  ip?: string,
): Promise<TurnstileResult> {
  // Sem secret configurada → não bloqueia (modo "sem proteção")
  if (!TURNSTILE_SECRET) {
    console.warn('[turnstile] TURNSTILE_SECRET_KEY não configurada — pulando validação')
    return { success: true, reason: 'secret-nao-configurada' }
  }

  // Secret configurada mas sem token → bloqueia (é exigido)
  if (!token) {
    return { success: false, reason: 'token-ausente' }
  }

  try {
    const form = new URLSearchParams()
    form.append('secret', TURNSTILE_SECRET)
    form.append('response', token)
    if (ip) form.append('remoteip', ip)

    const resp = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })

    const data = await resp.json() as {
      success: boolean
      'error-codes'?: string[]
    }

    if (data.success) {
      return { success: true }
    }
    return {
      success: false,
      reason: (data['error-codes'] || []).join(',') || 'falha-desconhecida',
    }
  } catch (err) {
    // Erro de rede ao validar — loga e, por segurança, NÃO bloqueia
    // (preferimos receber a mensagem a perder um contato legítimo por
    //  instabilidade de rede na validação).
    console.error('[turnstile] erro ao validar:', err)
    return { success: true, reason: 'erro-rede-liberado' }
  }
}
