// app/api/admin/licenses/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License, Event } from '@/lib/mongodb'
import { verificarAdmin, unauthorized } from '@/lib/auth'
import { gerarChaveUnica } from '@/lib/license'
import { enviarEmailAtivacao } from '@/lib/email'

// GET /api/admin/licenses — lista todas com filtro e paginação
export async function GET(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  await connectDB()

  const { searchParams } = new URL(req.url)
  const page   = parseInt(searchParams.get('page')  || '1')
  const limit  = parseInt(searchParams.get('limit') || '20')
  const status = searchParams.get('status') || ''
  const busca  = searchParams.get('q')      || ''

  const filtro: any = {}
  if (status) filtro.status = status
  if (busca)  filtro.$or = [
    { email: { $regex: busca, $options: 'i' } },
    { nome:  { $regex: busca, $options: 'i' } },
    { chave: { $regex: busca, $options: 'i' } },
  ]

  const [licenses, total] = await Promise.all([
    License.find(filtro)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    License.countDocuments(filtro),
  ])

  return NextResponse.json({ licenses, total, page, pages: Math.ceil(total / limit) })
}

// POST /api/admin/licenses — gera chave manual (para suporte)
export async function POST(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  await connectDB()

  const { email, nome, motivo } = await req.json()
  if (!email || !nome) {
    return NextResponse.json({ error: 'Email e nome obrigatorios' }, { status: 400 })
  }

  const chave = await gerarChaveUnica()
  await License.create({
    chave, email, nome,
    order_id:   `MANUAL-${Date.now()}`,
    status:     'inativa',
    machine_id: null,
    data_compra: new Date(),
  })

  await Event.create({
    tipo: 'compra', chave,
    dados: { email, nome, motivo: motivo || 'Gerada manualmente pelo admin' }
  })

  // Envia email com a chave
  try {
    await enviarEmailAtivacao(email, nome, chave)
  } catch (err) {
    console.error('Falha ao enviar email manual:', err)
  }

  return NextResponse.json({ chave, email, nome })
}
