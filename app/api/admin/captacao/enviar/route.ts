// ============================================================================
//  app/api/admin/captacao/enviar/route.ts — pré-visualizar e enviar.
//
//  GET devolve os modelos e a prévia já preenchida para um contato.
//  POST envia de verdade e grava no histórico.
//
//  Três travas, e cada uma existe por um erro que custa caro:
//
//  1. Variável faltando RECUSA o envio. Um "Vi seu vídeo sobre
//     {referencia}" enviado assim destrói o contato de forma
//     irrecuperável — e o e-mail não volta atrás.
//
//  2. Mesmo modelo para o mesmo contato é recusado. Repetir o texto é a
//     forma mais rápida de virar spam aos olhos de quem recebe.
//
//  3. O histórico é gravado mesmo quando o envio falha, com o erro. Sem
//     isso você não sabe se a pessoa não respondeu ou se nunca recebeu.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { verificarAdmin, unauthorized } from '@/lib/auth'
import { captacao, captacaoConfigurada } from '@/lib/captacao'
import { MODELOS, acharModelo, preencher } from '@/lib/modelos-email'

export const dynamic = 'force-dynamic'

const SITE = (process.env.SITE_URL || 'https://calegarisistemas.com.br')
  .replace(/\/+$/, '')

export async function GET(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()

  const contatoId = req.nextUrl.searchParams.get('contatoId')
  const modeloId = req.nextUrl.searchParams.get('modelo')

  const catalogo = MODELOS.map((m) => ({
    id: m.id, nome: m.nome, descricao: m.descricao, exige: m.exige,
  }))

  if (!contatoId || !modeloId) return NextResponse.json({ modelos: catalogo })

  try {
    const { Contato, Envio } = await captacao()
    const c = await Contato.findById(contatoId).lean() as any
    const m = acharModelo(modeloId)
    if (!c || !m) {
      return NextResponse.json({ error: 'Contato ou modelo não encontrado.' }, { status: 404 })
    }

    const previa = preencher(m, {
      nome: c.nome?.split(' ')[0], referencia: c.referencia,
      canal: c.canal, site: SITE,
    })

    const jaEnviado = await Envio.findOne({
      contatoId: String(c._id), modelo: modeloId, ok: true,
    }).select('enviadoEm -_id').lean() as any

    return NextResponse.json({
      modelos: catalogo,
      ...previa,
      jaEnviadoEm: jaEnviado?.enviadoEm ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  if (!captacaoConfigurada()) {
    return NextResponse.json({ error: 'MONGODB_URI não configurada.' }, { status: 503 })
  }
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return NextResponse.json(
      { error: 'Configure RESEND_API_KEY e EMAIL_FROM para enviar.' }, { status: 503 })
  }

  try {
    const { contatoId, modelo, assunto, corpo } = await req.json()
    const { Contato, Envio } = await captacao()

    const c = await Contato.findById(contatoId).lean() as any
    const m = acharModelo(modelo)
    if (!c || !m) {
      return NextResponse.json({ error: 'Contato ou modelo não encontrado.' }, { status: 404 })
    }

    // O corpo pode vir editado da tela — é comum ajustar uma frase antes
    // de mandar. Mas o preenchimento é conferido de novo aqui: confiar na
    // tela deixaria passar uma variável não substituída.
    const texto = String(corpo ?? '').trim()
    const titulo = String(assunto ?? '').trim()
    if (!texto || !titulo) {
      return NextResponse.json({ error: 'Assunto e corpo são obrigatórios.' }, { status: 400 })
    }

    const pendentes = texto.match(/\{(\w+)\}/g)
    if (pendentes) {
      return NextResponse.json({
        error: `O texto ainda tem variáveis não preenchidas: ${pendentes.join(', ')}. `
          + `Preencha antes de enviar — não dá para desfazer depois.`,
      }, { status: 400 })
    }

    const repetido = await Envio.findOne({
      contatoId: String(c._id), modelo, ok: true,
    }).lean()
    if (repetido) {
      return NextResponse.json({
        error: 'Este mesmo modelo já foi enviado para este contato. '
          + 'Use a segunda tentativa, ou apague o histórico se foi engano.',
      }, { status: 400 })
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    let ok = true, erro: string | null = null

    try {
      const r = await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to: [c.email],
        subject: titulo,
        // Sem isto, a resposta do criador vai para o endereço do FROM —
        // que o Resend usa para ENVIAR e não necessariamente recebe. Você
        // mandaria dezenas de e-mails e não veria resposta nenhuma.
        ...(process.env.EMAIL_REPLY_TO
          ? { replyTo: process.env.EMAIL_REPLY_TO } : {}),
        // Texto puro de propósito: HTML rico em contato frio parece
        // disparo em massa e passa pior no filtro.
        text: texto,
      })
      if ((r as any)?.error) { ok = false; erro = String((r as any).error?.message ?? 'falha') }
    } catch (e: any) {
      ok = false; erro = e.message
    }

    // Gravado mesmo com falha: sem isso você não sabe se a pessoa não
    // respondeu ou se nunca recebeu.
    await Envio.create({
      contatoId: String(c._id), email: c.email, modelo,
      assunto: titulo, corpo: texto, ok, erro,
    })

    if (ok) {
      await Contato.updateOne({ _id: c._id }, {
        $set: {
          ultimoEnvioEm: new Date(),
          ...(c.situacao === 'novo' ? { situacao: 'contatado' } : {}),
        },
        $inc: { enviosFeitos: 1 },
      })
    }

    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: `O envio falhou: ${erro}` }, { status: 502 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
