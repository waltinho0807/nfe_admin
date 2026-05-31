// app/api/admin/tickets/[id]/route.ts
//
// Atualiza o status de um ticket (novo → em_andamento → resolvido).
// Também permite ler um ticket específico (GET).
import { NextRequest, NextResponse } from 'next/server'
import { connectDB, Ticket } from '@/lib/mongodb'
import { verificarAdmin, unauthorized } from '@/lib/auth'

// GET /api/admin/tickets/[id] — detalhe de um ticket
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!verificarAdmin(req)) return unauthorized()
  await connectDB()

  const ticket = await Ticket.findOne({ ticket_id: params.id }).lean()
  if (!ticket) {
    return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
  }
  return NextResponse.json({ ticket })
}

// PATCH /api/admin/tickets/[id] — muda o status
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!verificarAdmin(req)) return unauthorized()
  await connectDB()

  const { status } = await req.json()
  const statusValidos = ['novo', 'em_andamento', 'resolvido']
  if (!statusValidos.includes(status)) {
    return NextResponse.json(
      { error: 'Status inválido. Use: novo, em_andamento ou resolvido' },
      { status: 400 },
    )
  }

  const ticket = await Ticket.findOneAndUpdate(
    { ticket_id: params.id },
    { status },
    { new: true },
  ).lean()

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
  }
  return NextResponse.json({ success: true, ticket })
}
