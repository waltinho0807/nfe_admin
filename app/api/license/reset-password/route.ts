// app/api/license/reset-password/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License, Event } from '@/lib/mongodb'
import { validarFormatoChave } from '@/lib/license'

// Endpoint chamado pelo app desktop quando usuario clica "Esqueci minha senha"
// A chave de licenca serve como prova de identidade

export async function POST(req: NextRequest) {
  try {
    await connectDB()

    const body  = await req.json()
    const chave = (body?.chave || '').trim().toUpperCase()

    if (!validarFormatoChave(chave)) {
      return NextResponse.json({
        valid: false,
        code: 'invalid_key',
        message: 'Formato de chave invalido.',
      }, { status: 400 })
    }

    const license = await License.findOne({ chave })

    if (!license) {
      return NextResponse.json({
        valid: false,
        code: 'not_found',
        message: 'Chave nao encontrada.',
      }, { status: 404 })
    }

    if (license.status === 'revogada') {
      return NextResponse.json({
        valid: false,
        code: 'revoked',
        message: 'Esta chave foi revogada.',
      }, { status: 403 })
    }

    // Chave valida — autoriza o reset
    await Event.create({
      tipo: 'reset_senha', chave,
      dados: { email: license.email, ip: req.headers.get('x-forwarded-for') }
    })

    return NextResponse.json({
      valid:   true,
      code:    'ok',
      message: 'Chave validada. Pode redefinir a senha.',
    })

  } catch (err) {
    console.error('Erro em /reset-password:', err)
    return NextResponse.json({ valid: false, code: 'server_error' }, { status: 500 })
  }
}
