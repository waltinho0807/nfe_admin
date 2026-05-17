// app/api/license/activate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License, Activation, Event } from '@/lib/mongodb'
import { validarFormatoChave } from '@/lib/license'

export async function POST(req: NextRequest) {
  try {
    await connectDB()

    const body      = await req.json()
    const chave     = (body?.chave     || '').trim().toUpperCase()
    const machine_id = (body?.machine_id || '').trim()
    const ip         = req.headers.get('x-forwarded-for') || 'unknown'
    const user_agent = req.headers.get('user-agent') || ''

    // Validacoes basicas
    if (!validarFormatoChave(chave)) {
      return NextResponse.json({
        valid: false,
        code:  'invalid_key',
        message: 'Formato de chave invalido.',
      }, { status: 400 })
    }

    if (!machine_id || machine_id.length < 8) {
      return NextResponse.json({
        valid: false,
        code:  'invalid_machine',
        message: 'ID de maquina invalido.',
      }, { status: 400 })
    }

    const license = await License.findOne({ chave })

    // Chave nao existe
    if (!license) {
      await Event.create({
        tipo: 'erro', chave,
        dados: { motivo: 'Chave nao encontrada', ip }
      })
      return NextResponse.json({
        valid: false,
        code:  'not_found',
        message: 'Chave nao encontrada. Verifique se digitou corretamente.',
      }, { status: 404 })
    }

    // Chave revogada
    if (license.status === 'revogada') {
      return NextResponse.json({
        valid: false,
        code:  'revoked',
        message: 'Esta chave foi revogada. Entre em contato com o suporte.',
      }, { status: 403 })
    }

    // Chave ja ativada — verifica se e a mesma maquina
    if (license.status === 'ativa' && license.machine_id) {
      if (license.machine_id === machine_id) {
        // Mesma maquina — atualiza ultimo acesso e libera
        await License.updateOne({ chave }, { ultimo_acesso: new Date() })
        return NextResponse.json({
          valid:   true,
          code:    'ok',
          message: 'Licenca valida.',
        })
      } else {
        // Maquina diferente — bloqueia
        await Event.create({
          tipo: 'erro', chave,
          dados: { motivo: 'Tentativa de ativacao em maquina diferente', ip, machine_id }
        })
        return NextResponse.json({
          valid: false,
          code:  'machine_mismatch',
          message: 'Esta chave ja esta ativada em outro computador. Entre em contato com o suporte.',
        }, { status: 403 })
      }
    }

    // Primeira ativacao — salva machine_id e ativa
    await License.updateOne({ chave }, {
      status:        'ativa',
      machine_id,
      data_ativacao: new Date(),
      ultimo_acesso: new Date(),
    })

    // Registra ativacao
    await Activation.create({ chave, machine_id, ip, user_agent })
    await Event.create({
      tipo: 'ativacao', chave,
      dados: { machine_id, ip, email: license.email }
    })

    console.log(`Chave ${chave} ativada — ${license.email} — ${ip}`)

    return NextResponse.json({
      valid:   true,
      code:    'ok',
      message: 'Licenca ativada com sucesso!',
    })

  } catch (err) {
    console.error('Erro em /activate:', err)
    return NextResponse.json({
      valid: false,
      code:  'server_error',
      message: 'Erro interno. Tente novamente.',
    }, { status: 500 })
  }
}
