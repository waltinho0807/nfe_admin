// ============================================================================
//  app/api/admin/web/saques/route.ts — a fila de saques.
//
//  GET lista os pedidos com quem pediu, quanto, quando e a chave Pix.
//  POST dá baixa depois que você fez a transferência.
//
//  A baixa é condicionada a situacao: "solicitado". Se dois cliques saírem
//  juntos, o segundo não encontra nada para atualizar e avisa — em vez de
//  marcar de novo e te deixar sem saber se pagou uma ou duas vezes.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { verificarAdmin, unauthorized } from '@/lib/auth'
import { web, webConfigurado } from '@/lib/webdb'
import mongoose from 'mongoose'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  if (!webConfigurado()) {
    return NextResponse.json({ error: 'WEB_MONGODB_URI não configurada.' }, { status: 503 })
  }

  try {
    const { Saque, User, Indicacao } = await web()

    const saques = await Saque.find({}).sort({ pedidoEm: -1 }).limit(200).lean() as any[]
    const ids = [...new Set(saques.map((s: any) => s.parceiroUserId))]

    const parceiros = await User.find({ id: { $in: ids } })
      .select('id name email tipo afiliado -_id').lean() as any[]
    const porId = new Map(parceiros.map((p: any) => [p.id, p] as const))

    // Quanto cada parceiro ainda tem a receber, para você ver a fila
    // inteira sem abrir conta por conta.
    const pendentes = await Indicacao.aggregate([
      { $match: { parceiroUserId: { $in: ids },
                  situacao: { $in: ['pago', 'liberado'] } } },
      { $group: { _id: '$parceiroUserId',
                  total: { $sum: { $add: ['$valorPrimeira', '$valorSegunda'] } } } },
    ])
    const aReceber = new Map(pendentes.map((p: any) => [p._id, p.total] as const))

    return NextResponse.json({
      saques: saques.map((s: any) => {
        const p = porId.get(s.parceiroUserId)
        return {
          id: String(s._id),
          parceiro: p?.name ?? `#${s.parceiroUserId}`,
          email: p?.email ?? null,
          codigo: p?.afiliado?.codigo ?? null,
          valor: s.valor,
          pixTipo: s.pixTipo ?? null,
          pixChave: s.pixChave ?? null,
          situacao: s.situacao,
          pedidoEm: s.pedidoEm ?? null,
          pagoEm: s.pagoEm ?? null,
          quantasIndicacoes: (s.indicacoes ?? []).length,
          aindaAReceber: aReceber.get(s.parceiroUserId) ?? 0,
        }
      }),
      pendentes: saques.filter((s: any) => s.situacao === 'solicitado').length,
      totalPendente: Number(saques
        .filter((s: any) => s.situacao === 'solicitado')
        .reduce((t: number, s: any) => t + (s.valor ?? 0), 0).toFixed(2)),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  if (!webConfigurado()) {
    return NextResponse.json({ error: 'WEB_MONGODB_URI não configurada.' }, { status: 503 })
  }

  try {
    const { id, comprovante } = await req.json() as { id: string; comprovante?: string }
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'id inválido.' }, { status: 400 })
    }

    const { Saque, Auditoria } = await web()

    // Só sai de "solicitado". É o que impede marcar duas vezes e ficar sem
    // saber se o Pix foi feito uma vez ou duas.
    const r = await Saque.updateOne(
      { _id: id, situacao: 'solicitado' },
      { $set: { situacao: 'pago', pagoEm: new Date(),
                comprovante: String(comprovante ?? '').slice(0, 200) } })

    if (!r.matchedCount) {
      return NextResponse.json(
        { error: 'Saque não encontrado ou já marcado como pago.' }, { status: 404 })
    }

    const s = await Saque.findById(id).select('parceiroUserId valor -_id').lean() as any
    await Auditoria.create({
      quem: 'painel-admin', acao: 'saque:pago',
      userId: s?.parceiroUserId ?? null,
      antes: { situacao: 'solicitado' },
      depois: { situacao: 'pago', valor: s?.valor ?? null },
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
