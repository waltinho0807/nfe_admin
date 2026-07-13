// app/api/admin/stats/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License, Event } from '@/lib/mongodb'
import { verificarAdmin, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  await connectDB()

  const agora    = new Date()
  const inicio30 = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000)
  const inicio7  = new Date(agora.getTime() -  7 * 24 * 60 * 60 * 1000)

  const [
    total, ativas, inativas, revogadas,
    novas30, novas7, ativacoesHoje,
    eventosRecentes,
    // ── Funil do novo modelo (trial → anual) ──
    trials, trialsAtivados, anuais, vencendo7d, vencidas,
  ] = await Promise.all([
    License.countDocuments(),
    License.countDocuments({ status: 'ativa' }),
    License.countDocuments({ status: 'inativa' }),
    License.countDocuments({ status: 'revogada' }),
    License.countDocuments({ created_at: { $gte: inicio30 } }),
    License.countDocuments({ created_at: { $gte: inicio7 } }),
    License.countDocuments({ data_ativacao: { $gte: new Date(agora.toDateString()) } }),
    Event.find().sort({ data: -1 }).limit(20).lean(),
    License.countDocuments({ plano: 'trial' }),
    License.countDocuments({ plano: 'trial', machine_id: { $ne: null } }),
    License.countDocuments({ plano: 'anual' }),
    License.countDocuments({
      plano: { $in: ['trial', 'anual'] },
      expira_em: { $gt: agora,
                   $lte: new Date(agora.getTime() + 7 * 86400000) },
    }),
    License.countDocuments({
      plano: { $in: ['trial', 'anual'] },
      expira_em: { $lte: agora },
    }),
  ])

  return NextResponse.json({
    total, ativas, inativas, revogadas,
    novas30, novas7, ativacoesHoje,
    eventosRecentes,
    funil: { trials, trials_ativados: trialsAtivados,
             anuais, vencendo_7d: vencendo7d, vencidas },
  })
}
