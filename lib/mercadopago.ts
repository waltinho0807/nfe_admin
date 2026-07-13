// lib/mercadopago.ts
//
// Tudo que é ESPECÍFICO do Mercado Pago vive aqui (criação de
// preferência do Checkout Pro, consulta de pagamento e validação da
// assinatura do webhook). Sem SDK — fetch puro, zero dependência nova.
//
// Env vars:
//   MP_ACCESS_TOKEN     → credencial do vendedor (painel MP > Suas
//                         integrações > Credenciais de produção)
//   MP_WEBHOOK_SECRET   → assinatura secreta do webhook (painel MP >
//                         Webhooks). Se ausente, valida com aviso no
//                         log (mesmo padrão gracioso do turnstile.ts).

import crypto from 'crypto'

const API = 'https://api.mercadopago.com'

function token(): string {
  return process.env.MP_ACCESS_TOKEN || ''
}

// ── Checkout Pro: cria a preferência e devolve a URL de pagamento ────

export async function criarPreference(dados: {
  chave: string
  titulo: string
  valor: number
  notificationUrl: string
  successUrl: string
}): Promise<{ ok: boolean; init_point?: string; erro?: string }> {
  if (!token()) {
    return { ok: false, erro: 'MP_ACCESS_TOKEN não configurado.' }
  }
  const body = {
    items: [{
      title: dados.titulo,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: Number(dados.valor.toFixed(2)),
    }],
    external_reference: dados.chave,      // ← liga o pagamento à licença
    notification_url: dados.notificationUrl,
    back_urls: { success: dados.successUrl,
                 pending: dados.successUrl,
                 failure: dados.successUrl },
    auto_return: 'approved',
    statement_descriptor: 'NFEDESKTOP',
  }
  const r = await fetch(`${API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j?.init_point) {
    return { ok: false,
             erro: j?.message || `MP preferences HTTP ${r.status}` }
  }
  return { ok: true, init_point: j.init_point }
}

// ── Consulta de pagamento (o webhook manda só o id) ──────────────────

export async function buscarPagamento(id: string): Promise<{
  ok: boolean
  status?: string
  external_reference?: string
  valor?: number
  erro?: string
}> {
  const r = await fetch(`${API}/v1/payments/${id}`, {
    headers: { authorization: `Bearer ${token()}` },
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    return { ok: false, erro: j?.message || `MP payments HTTP ${r.status}` }
  }
  return {
    ok: true,
    status: j?.status,                       // approved | refunded | ...
    external_reference: j?.external_reference,
    valor: Number(j?.transaction_amount || 0),
  }
}

// ── Validação da assinatura do webhook ───────────────────────────────
// O MP manda: header x-signature ("ts=...,v1=...") + x-request-id, e o
// id do recurso em ?data.id=. O manifest oficial é:
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// (data.id alfanumérico vai em minúsculas), HMAC-SHA256 com a secret.

export function validarAssinaturaWebhook(opts: {
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
}): { ok: boolean; motivo?: string } {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[MP] MP_WEBHOOK_SECRET ausente — assinatura NÃO validada '
      + '(configure em produção).')
    return { ok: true, motivo: 'sem_secret' }
  }
  if (!opts.xSignature || !opts.dataId) {
    return { ok: false, motivo: 'headers_ausentes' }
  }
  const partes: Record<string, string> = {}
  for (const p of opts.xSignature.split(',')) {
    const [k, v] = p.split('=').map(s => s?.trim())
    if (k && v) partes[k] = v
  }
  const ts = partes['ts']
  const v1 = partes['v1']
  if (!ts || !v1) return { ok: false, motivo: 'formato_assinatura' }

  const dataId = /^[a-zA-Z0-9]+$/.test(opts.dataId)
    ? opts.dataId.toLowerCase()
    : opts.dataId
  const manifest =
    `id:${dataId};` +
    (opts.xRequestId ? `request-id:${opts.xRequestId};` : '') +
    `ts:${ts};`
  const esperado = crypto.createHmac('sha256', secret)
    .update(manifest).digest('hex')
  if (esperado !== v1) return { ok: false, motivo: 'hmac_divergente' }
  return { ok: true }
}
