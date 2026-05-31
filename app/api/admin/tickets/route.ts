// app/api/admin/tickets/route.ts
//
// Lista os tickets de suporte pro painel admin.
// Mesmo padrão de app/api/admin/licenses/route.ts:
//   verificarAdmin → connectDB → query com filtro/paginação → JSON
import { NextRequest, NextResponse } from 'next/server'
import { connectDB, Ticket } from '@/lib/mongodb'
import { verificarAdmin, unauthorized } from '@/lib/auth'

// GET /api/admin/tickets — lista com filtro (status, categoria, busca) e paginação
export async function GET(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  await connectDB()

  const { searchParams } = new URL(req.url)
  const page      = parseInt(searchParams.get('page')  || '1')
  const limit     = parseInt(searchParams.get('limit') || '20')
  const status    = searchParams.get('status')    || ''
  const categoria = searchParams.get('categoria') || ''
  const busca     = searchParams.get('q')         || ''

  const filtro: any = {}
  if (status)    filtro.status = status
  if (categoria) filtro.categoria = categoria
  if (busca) filtro.$or = [
    { email:     { $regex: busca, $options: 'i' } },
    { nome:      { $regex: busca, $options: 'i' } },
    { mensagem:  { $regex: busca, $options: 'i' } },
    { ticket_id: { $regex: busca, $options: 'i' } },
  ]

  const [tickets, total, novos, emAndamento, resolvidos] = await Promise.all([
    Ticket.find(filtro)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Ticket.countDocuments(filtro),
    Ticket.countDocuments({ status: 'novo' }),
    Ticket.countDocuments({ status: 'em_andamento' }),
    Ticket.countDocuments({ status: 'resolvido' }),
  ])

  return NextResponse.json({
    tickets,
    total,
    page,
    pages: Math.ceil(total / limit),
    contadores: { novos, emAndamento, resolvidos },
  })
}
