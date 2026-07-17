// app/api/webhook/mercadopago/route.ts
// Recebe as notificações do MP (POST com ?data.id= + x-signature) e o
// pagamento SIMULADO do modo mock (form-urlencoded com mock=1).
// approved → ativarAssinatura (idempotente por payment id)
// refunded/charged_back → corta o acesso.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { ativarAssinatura, desativarPorEstorno, mockAtivo } from '@/lib/billing'
import { buscarPagamento, validarAssinaturaWebhook } from '@/lib/mercadopago'

function htmlOk(titulo: string, corpo: string) {
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
     <title>${titulo}</title>
     <style>body{font-family:system-ui;background:#0f1115;color:#e8e8e8;
       display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
       .card{background:#1a1d24;padding:40px 44px;border-radius:12px;
       max-width:480px;text-align:center}h1{font-size:20px}</style></head>
     <body><div class="card"><h1>${titulo}</h1><p>${corpo}</p></div></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get('content-type') || ''

    // ── Modo MOCK: form do checkout simulado ─────────────────────────
    if (mockAtivo() && ct.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData()
      if (form.get('mock') === '1') {
        const chave = String(form.get('chave') || '').toUpperCase()
        const valor = Number(form.get('valor') || 0)
        const r = await ativarAssinatura({
          chave, gateway: 'mock',
          pagamento_id: `MOCK-${Date.now()}`, valor,
        })
        if (!r.ok) return htmlOk('Falha na simulação', r.erro || 'Erro.')
        const ate = r.expira_em
          ? new Date(r.expira_em).toLocaleDateString('pt-BR') : ''
        return htmlOk('✅ Pagamento simulado aprovado',
          `Licença ativa até <b>${ate}</b>. Volte ao NF-e Desktop e clique `
          + 'em <b>"Já paguei — verificar"</b>.')
      }
    }

    // ── Webhook real do Mercado Pago ─────────────────────────────────
    const body = ct.includes('json') ? await req.json().catch(() => ({})) : {}
    const dataId = req.nextUrl.searchParams.get('data.id')
      || String(body?.data?.id || '')
    if (!dataId) {
      // Notificações que não são de pagamento (merchant_order etc): OK e sai
      return NextResponse.json({ ok: true, ignorado: true })
    }
    const sig = validarAssinaturaWebhook({
      xSignature: req.headers.get('x-signature'),
      xRequestId: req.headers.get('x-request-id'),
      dataId,
    })
    if (!sig.ok) {
      console.warn('Webhook MP com assinatura inválida:', sig.motivo)
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const pg = await buscarPagamento(dataId)
    if (!pg.ok) {
      console.error('Webhook MP: falha ao buscar pagamento', dataId, pg.erro)
      // 200 pra não gerar tempestade de retries em id inválido
      return NextResponse.json({ ok: true, ignorado: true })
    }

    if (pg.status === 'approved' && pg.external_reference) {
      const r = await ativarAssinatura({
        chave: pg.external_reference.toUpperCase(),
        gateway: 'mercadopago',
        pagamento_id: dataId,
        valor: pg.valor,
      })
      console.log(`[MP] pagamento ${dataId} → ${pg.external_reference}:`,
        r.ok ? (r.ja_processado ? 'já processado' : 'ativado') : r.erro)
    } else if (pg.status === 'refunded' || pg.status === 'charged_back'
               || pg.status === 'cancelled') {
      await desativarPorEstorno(dataId, pg.status || '')
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Erro em /webhook/mercadopago:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
