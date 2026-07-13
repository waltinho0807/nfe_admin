// app/api/cron/lembretes/route.ts
// Roda 1x/dia (vercel.json). Envia lembretes de vencimento:
//   trial: D-3 e D-1  |  anual: D-15, D-7 e D-1
// Anti-duplicata: tag em license.lembretes_enviados (zerada a cada
// renovação pelo billing). Protegido por CRON_SECRET (a Vercel envia
// Authorization: Bearer <CRON_SECRET> automaticamente).
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License } from '@/lib/mongodb'
import { enviarEmailLembrete } from '@/lib/email'

const JANELAS: Array<{ plano: 'trial' | 'anual'; dias: number }> = [
  { plano: 'trial', dias: 3 }, { plano: 'trial', dias: 1 },
  { plano: 'anual', dias: 15 }, { plano: 'anual', dias: 7 },
  { plano: 'anual', dias: 1 },
]

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  try {
    await connectDB()
    const agora = Date.now()
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || req.nextUrl.origin
    let enviados = 0

    for (const j of JANELAS) {
      const tag = `${j.plano}_d${j.dias}`
      const ate = new Date(agora + j.dias * 86400000)
      const candidatas = await License.find({
        plano: j.plano,
        expira_em: { $gt: new Date(agora), $lte: ate },
        lembretes_enviados: { $ne: tag },
        status: { $nin: ['revogada', 'suspensa'] },
      }).limit(200)

      for (const lic of candidatas) {
        const diasReais = Math.ceil(
          (new Date(lic.expira_em).getTime() - agora) / 86400000)
        try {
          await enviarEmailLembrete(lic.email, lic.nome, {
            dias: diasReais, plano: j.plano,
            checkoutUrl: `${apiUrl}/api/checkout?chave=${lic.chave}`,
          })
          await License.updateOne({ chave: lic.chave },
            { $addToSet: { lembretes_enviados: tag } })
          enviados++
        } catch (e) {
          console.error(`Lembrete falhou (${lic.chave}, ${tag}):`, e)
        }
      }
    }
    return NextResponse.json({ ok: true, enviados })
  } catch (err) {
    console.error('Erro no cron de lembretes:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
