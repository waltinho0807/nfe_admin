// app/api/trial/route.ts
// POST { nome, email, turnstile_token }
// Cria a licença TRIAL (15 dias a partir de AGORA — a "data de download")
// e envia a chave por e-mail. A chave NUNCA volta na resposta HTTP:
// o e-mail é a validação do e-mail.
import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License, Event } from '@/lib/mongodb'
import { gerarChaveUnica } from '@/lib/license'
import { validarTurnstile } from '@/lib/turnstile'
import { calcularExpiracaoTrial, DIAS_TRIAL } from '@/lib/billing'
import { enviarEmailTrial } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json().catch(() => ({}))
    const nome  = String(body?.nome  || '').trim().slice(0, 120)
    const email = String(body?.email || '').trim().toLowerCase()
    const token = String(body?.turnstile_token || '')
    const ip    = req.headers.get('x-forwarded-for') || 'unknown'

    if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, code: 'invalid_params',
          message: 'Informe seu nome e um e-mail válido.' }, { status: 400 })
    }
    const turnstile = await validarTurnstile(token, ip)
    if (!turnstile.success) {
      return NextResponse.json(
        { ok: false, code: 'turnstile',
          message: 'Verificação anti-robô falhou. Recarregue e tente de novo.' },
        { status: 400 })
    }

    await connectDB()

    // 1 trial por e-mail; quem já tem licença recebe orientação, não outra chave
    const existente = await License.findOne({ email })
    if (existente) {
      const plano = existente.plano || 'vitalicia'
      const message = plano === 'trial'
        ? 'Este e-mail já usou o período de teste. Sua chave foi enviada '
          + 'no primeiro cadastro — procure por "NF-e Desktop" na sua caixa '
          + 'de entrada. Para continuar usando, assine pelo próprio app.'
        : 'Já existe uma licença para este e-mail. Procure o e-mail com '
          + 'sua chave ou fale com o suporte.'
      return NextResponse.json(
        { ok: false, code: 'email_exists', message }, { status: 409 })
    }

    const chave = await gerarChaveUnica()
    const expira = calcularExpiracaoTrial()
    await License.create({
      chave, email, nome,
      order_id: `TRIAL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      status: 'inativa',            // ativa quando o app vincular a máquina
      plano: 'trial',
      expira_em: expira,
      origem: 'site',
    })
    await Event.create({
      tipo: 'trial', chave, dados: { email, nome, ip, dias: DIAS_TRIAL },
    }).catch(() => {})

    try {
      await enviarEmailTrial(email, nome, chave, expira)
    } catch (e) {
      console.error('Falha ao enviar email do trial:', e)
      return NextResponse.json(
        { ok: false, code: 'email_fail',
          message: 'Não conseguimos enviar o e-mail agora. Tente novamente '
            + 'em instantes.' }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      message: `Enviamos sua chave de ativação para ${email}. `
        + `Seu teste grátis de ${DIAS_TRIAL} dias já está contando.`,
    })
  } catch (err) {
    console.error('Erro em /api/trial:', err)
    return NextResponse.json(
      { ok: false, code: 'server_error', message: 'Erro interno.' },
      { status: 500 })
  }
}
