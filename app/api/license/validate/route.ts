// app/api/license/validate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License, Event } from '@/lib/mongodb'
import { validarFormatoChave } from '@/lib/license'

export async function POST(req: NextRequest) {
  try {
    await connectDB()

    const body       = await req.json()
    const chave      = (body?.chave      || '').trim().toUpperCase()
    const machine_id = (body?.machine_id || '').trim()

    if (!validarFormatoChave(chave) || !machine_id) {
      return NextResponse.json({ valid: false, code: 'invalid_params' }, { status: 400 })
    }

    const license = await License.findOne({ chave })

    if (!license) {
      return NextResponse.json({ valid: false, code: 'not_found' }, { status: 404 })
    }

    if (license.status === 'revogada') {
      return NextResponse.json({ valid: false, code: 'revoked' }, { status: 403 })
    }

    if (license.status === 'suspensa') {
      return NextResponse.json({ valid: false, code: 'suspended' }, { status: 403 })
    }

    // Verifica se e a mesma maquina que ativou
    if (license.machine_id && license.machine_id !== machine_id) {
      return NextResponse.json({ valid: false, code: 'machine_mismatch' }, { status: 403 })
    }

    // Atualiza ultimo acesso
    await License.updateOne({ chave }, { ultimo_acesso: new Date() })
    await Event.create({
      tipo: 'validacao', chave,
      dados: { machine_id, ip: req.headers.get('x-forwarded-for') }
    })

    return NextResponse.json({ valid: true, code: 'ok', message: 'OK' })

  } catch (err) {
    console.error('Erro em /validate:', err)
    return NextResponse.json({ valid: false, code: 'server_error' }, { status: 500 })
  }
}
