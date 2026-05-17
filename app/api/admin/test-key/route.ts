// app/api/admin/test-key/route.ts
//
// Endpoint para criar chaves de teste rapidamente, sem email.
// Use apenas em desenvolvimento e testes — em produção, prefira
// /api/admin/licenses (que envia email ao cliente).
//
// POST /api/admin/test-key
//   body: { email?, nome? }  (opcionais, defaults sao "test@test.com" e "Teste")
//   resposta: { chave, email, nome }
//
// DELETE /api/admin/test-key?chave=ERPA-XXXX-XXXX-XXXX
//   remove a chave de teste do banco — limpeza pos-teste.

import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License, Event } from '@/lib/mongodb'
import { verificarAdmin, unauthorized } from '@/lib/auth'
import { gerarChaveUnica, validarFormatoChave } from '@/lib/license'

// POST — cria chave de teste
export async function POST(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  await connectDB()

  let body: any = {}
  try { body = await req.json() } catch {}

  const email = (body.email || 'test@test.com').toLowerCase().trim()
  const nome  = (body.nome  || 'Teste').trim()

  const chave = await gerarChaveUnica()
  await License.create({
    chave, email, nome,
    order_id:    `TEST-${Date.now()}`,
    status:      'inativa',
    machine_id:  null,
    data_compra: new Date(),
  })

  await Event.create({
    tipo:  'compra', chave,
    dados: { email, nome, motivo: 'Chave de teste (sem email)' }
  })

  return NextResponse.json({
    chave, email, nome,
    mensagem: 'Chave criada. Use no app desktop para ativar.',
  })
}

// DELETE — apaga chave de teste (limpeza pos-teste)
export async function DELETE(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  await connectDB()

  const { searchParams } = new URL(req.url)
  const chave = (searchParams.get('chave') || '').toUpperCase()

  if (!validarFormatoChave(chave)) {
    return NextResponse.json({ error: 'Formato de chave invalido' }, { status: 400 })
  }

  const license = await License.findOne({ chave })
  if (!license) {
    return NextResponse.json({ error: 'Chave nao encontrada' }, { status: 404 })
  }

  // Apaga apenas se for chave de teste (order_id comeca com TEST- ou MANUAL-)
  const oid = license.order_id || ''
  if (!oid.startsWith('TEST-') && !oid.startsWith('MANUAL-')) {
    return NextResponse.json({
      error: 'Apenas chaves TEST- ou MANUAL- podem ser removidas por aqui.',
    }, { status: 403 })
  }

  await License.deleteOne({ chave })
  await Event.create({
    tipo: 'erro', chave,
    dados: { motivo: 'Chave de teste removida via /test-key' }
  })

  return NextResponse.json({ success: true, removida: chave })
}
