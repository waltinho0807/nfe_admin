// ============================================================================
//  app/api/admin/captacao/contatos/route.ts
//
//  GET lista com o histórico resumido; POST cria ou atualiza um contato.
//  O POST aceita vários de uma vez, porque a origem é uma lista colada do
//  painel de criadores do Google Ads, não um cadastro por vez.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { verificarAdmin, unauthorized } from '@/lib/auth'
import { captacao, captacaoConfigurada } from '@/lib/captacao'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  if (!captacaoConfigurada()) {
    return NextResponse.json({ error: 'MONGODB_URI não configurada.' }, { status: 503 })
  }

  try {
    const { Contato, Envio, Resposta } = await captacao()
    const contatos = await Contato.find({})
      .sort({ criadoEm: -1 }).limit(500).lean() as any[]

    const envios = await Envio.find({})
      .sort({ enviadoEm: -1 }).limit(2000)
      .select('contatoId modelo assunto enviadoEm ok erro -_id').lean() as any[]

    const respostas = await Resposta.find({})
      .sort({ recebidoEm: -1 }).limit(500)
      .select('contatoId de assunto texto recebidoEm lida -_id').lean() as any[]

    const respPorContato = new Map<string, any[]>()
    for (const r of respostas) {
      if (!r.contatoId) continue
      const l = respPorContato.get(r.contatoId) ?? []
      l.push(r)
      respPorContato.set(r.contatoId, l)
    }

    const porContato = new Map<string, any[]>()
    for (const e of envios) {
      const l = porContato.get(e.contatoId) ?? []
      l.push(e)
      porContato.set(e.contatoId, l)
    }

    return NextResponse.json({
      contatos: contatos.map((c: any) => ({
        ...c, _id: String(c._id),
        historico: porContato.get(String(c._id)) ?? [],
        respostas: respPorContato.get(String(c._id)) ?? [],
      })),
      resumo: {
        total: contatos.length,
        novos: contatos.filter((c: any) => c.situacao === 'novo').length,
        contatados: contatos.filter((c: any) => c.situacao === 'contatado').length,
        responderam: contatos.filter((c: any) =>
          ['respondeu', 'negociando', 'fechado'].includes(c.situacao)).length,
        fechados: contatos.filter((c: any) => c.situacao === 'fechado').length,
        respostasNaoLidas: respostas.filter((r: any) => !r.lida).length,
      },
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

  try {
    const corpo = await req.json()
    const lista: any[] = Array.isArray(corpo?.contatos) ? corpo.contatos : [corpo]
    const { Contato } = await captacao()

    let criados = 0, atualizados = 0
    const recusados: string[] = []

    for (const c of lista) {
      const email = String(c?.email ?? '').trim().toLowerCase()
      const nome = String(c?.nome ?? '').trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !nome) {
        recusados.push(c?.email ?? c?.nome ?? '(vazio)')
        continue
      }

      // Upsert por e-mail: importar a mesma lista duas vezes não pode
      // duplicar ninguém nem apagar o histórico de quem já foi contatado.
      const r = await Contato.updateOne({ email }, {
        $set: {
          nome,
          tipo: ['influenciador', 'contador', 'parceiro', 'outro']
            .includes(c?.tipo) ? c.tipo : 'influenciador',
          canal: c?.canal ?? null,
          audiencia: c?.audiencia ?? null,
          referencia: c?.referencia ?? null,
          observacoes: c?.observacoes ?? null,
        },
        $setOnInsert: { email, situacao: 'novo', criadoEm: new Date() },
      }, { upsert: true })

      if (r.upsertedCount) criados++; else atualizados++
    }

    return NextResponse.json({ ok: true, criados, atualizados, recusados })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/** Muda a situação de um contato, ou apaga. */
export async function PUT(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  try {
    const { id, situacao, observacoes, referencia } = await req.json()
    const { Contato } = await captacao()
    const set: any = {}
    if (situacao) set.situacao = situacao
    if (observacoes !== undefined) set.observacoes = observacoes
    if (referencia !== undefined) set.referencia = referencia
    if (!Object.keys(set).length) {
      return NextResponse.json({ error: 'Nada para alterar.' }, { status: 400 })
    }
    await Contato.updateOne({ _id: id }, { $set: set })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
