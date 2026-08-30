// ============================================================================
//  app/api/webhooks/resend-inbound/route.ts — respostas dos contatos.
//
//  O Resend recebe o e-mail, parseia, e faz um POST aqui com o evento
//  email.received. A resposta é ligada ao contato pelo endereço de quem
//  mandou, e a situação dele vira "respondeu" sozinha.
//
//  ATENÇÃO ao configurar: para receber no seu próprio domínio, o Resend
//  exige um registro MX com a MENOR prioridade — o que faz ele mandar em
//  todo o e-mail do domínio. Se você usa e-mail em calegarisistemas.com.br,
//  isso sequestra a sua caixa. Use o endereço automático <id>.resend.app,
//  que não precisa de DNS nenhum, ou um subdomínio dedicado.
//
//  A proteção é um segredo na própria URL do webhook, e não assinatura
//  Svix. É mais fraco, e assumo isso: o que está em jogo é o seu registro
//  de captação, não dado de cliente. Se um dia isto guardar algo sensível,
//  troque por verificação de assinatura.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { captacao, captacaoConfigurada } from '@/lib/captacao'

export const dynamic = 'force-dynamic'

/** Extrai o endereço de "Fulano <fulano@x.com>" ou já cru. */
function soEndereco(v: unknown): string {
  const t = String(v ?? '')
  const m = t.match(/<([^>]+)>/)
  return (m ? m[1] : t).trim().toLowerCase()
}

export async function POST(req: NextRequest) {
  const segredo = process.env.INBOUND_SECRET
  if (!segredo || req.nextUrl.searchParams.get('s') !== segredo) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  }
  if (!captacaoConfigurada()) {
    return NextResponse.json({ error: 'sem banco' }, { status: 503 })
  }

  try {
    const evento = await req.json()
    if (evento?.type && evento.type !== 'email.received') {
      // Outros eventos do Resend (delivered, bounced) chegam aqui também.
      // Responder 200 evita que ele fique reenviando.
      return NextResponse.json({ ok: true, ignorado: evento.type })
    }

    const d = evento?.data ?? evento
    const de = soEndereco(Array.isArray(d?.from) ? d.from[0] : d?.from)
    if (!de) return NextResponse.json({ ok: true, ignorado: 'sem remetente' })

    const { Contato, Resposta } = await captacao()

    // Idempotência: o Resend reenvia quando não recebe 200 rápido, e sem
    // isto a mesma resposta apareceria várias vezes.
    const externoId = String(d?.email_id ?? d?.id ?? '')
    if (externoId && await Resposta.findOne({ externoId }).lean()) {
      return NextResponse.json({ ok: true, duplicado: true })
    }

    const contato = await Contato.findOne({ email: de }).lean() as any

    await Resposta.create({
      contatoId: contato ? String(contato._id) : null,
      de,
      assunto: String(d?.subject ?? '').slice(0, 300),
      texto: String(d?.text ?? d?.html ?? '').slice(0, 20000),
      externoId: externoId || null,
    })

    // Só avança a situação de quem ainda não avançou: se você já marcou
    // "negociando" ou "fechado" à mão, uma resposta nova não te faz voltar.
    if (contato && ['novo', 'contatado'].includes(contato.situacao)) {
      await Contato.updateOne({ _id: contato._id },
        { $set: { situacao: 'respondeu' } })
    }

    return NextResponse.json({ ok: true, ligado: !!contato })
  } catch (e: any) {
    // 200 mesmo com erro: reenvio não conserta payload que não sei ler, e
    // ficar recebendo o mesmo evento em loop só atrapalha.
    console.error('[inbound] falhou:', e.message)
    return NextResponse.json({ ok: false, erro: e.message })
  }
}
