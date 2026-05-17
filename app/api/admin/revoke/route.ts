// app/api/admin/revoke/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License, Event } from '@/lib/mongodb'
import { verificarAdmin, unauthorized } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  await connectDB()

  const { chave, motivo } = await req.json()
  if (!chave) return NextResponse.json({ error: 'Chave obrigatoria' }, { status: 400 })

  const license = await License.findOne({ chave })
  if (!license) return NextResponse.json({ error: 'Chave nao encontrada' }, { status: 404 })

  await License.updateOne({ chave }, { status: 'revogada' })
  await Event.create({
    tipo: 'revogacao', chave,
    dados: { motivo: motivo || 'Revogada pelo admin', email: license.email }
  })

  return NextResponse.json({ success: true, message: `Chave ${chave} revogada.` })
}
