// app/api/admin/reset-machine/route.ts
//
// Endpoint para resetar o machine_id de uma chave — usado quando
// o cliente troca de computador, formata o PC, etc.
//
// Após reset, a chave volta a status "inativa" e pode ser ativada
// numa nova máquina (só uma vez — depois ficará travada na nova).
//
// POST /api/admin/reset-machine
//   body: { chave, motivo? }
//   resposta: { success, chave, mensagem }

import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License, Event } from '@/lib/mongodb'
import { verificarAdmin, unauthorized } from '@/lib/auth'
import { validarFormatoChave } from '@/lib/license'

export async function POST(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  await connectDB()

  const body = await req.json()
  const chave = (body?.chave || '').trim().toUpperCase()
  const motivo = (body?.motivo || 'Cliente solicitou troca de máquina').trim()

  if (!validarFormatoChave(chave)) {
    return NextResponse.json({ error: 'Formato de chave inválido' }, { status: 400 })
  }

  const license = await License.findOne({ chave })
  if (!license) {
    return NextResponse.json({ error: 'Chave não encontrada' }, { status: 404 })
  }

  if (license.status === 'revogada') {
    return NextResponse.json({
      error: 'Chave revogada não pode ser resetada. Reative-a primeiro.'
    }, { status: 400 })
  }

  const machineAntigo = license.machine_id

  // Reseta — volta para inativa, machine_id null, mantém histórico de email/nome/order_id
  await License.updateOne({ chave }, {
    status: 'inativa',
    machine_id: null,
    data_ativacao: null,
  })

  await Event.create({
    tipo: 'erro',  // não temos tipo "reset" definido, mas registramos no histórico
    chave,
    dados: {
      acao: 'reset_machine',
      machine_anterior: machineAntigo,
      motivo,
      email: license.email,
    }
  })

  return NextResponse.json({
    success: true,
    chave,
    mensagem: `Máquina resetada. ${license.email} pode ativar a chave em um novo PC.`,
  })
}
