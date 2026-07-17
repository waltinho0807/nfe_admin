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
import { normalizarEmail, ehEmailDescartavel,
         LIMITE_TRIALS_POR_IP_DIA,
         LIMITE_SEM_TURNSTILE_POR_IP_DIA } from '@/lib/antiabuso'
import { enviarEmailTrial } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json().catch(() => ({}))
    const nome      = String(body?.nome      || '').trim().slice(0, 80)
    const sobrenome = String(body?.sobrenome || '').trim().slice(0, 80)
    const telefone  = String(body?.telefone  || '').replace(/\D/g, '').slice(0, 13)
    const email     = String(body?.email     || '').trim().toLowerCase()
    const token = String(body?.turnstile_token || '')
    const ip    = req.headers.get('x-forwarded-for') || 'unknown'

    if (!nome || !sobrenome) {
      return NextResponse.json(
        { ok: false, code: 'invalid_params',
          message: 'Informe seu nome e sobrenome.' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, code: 'invalid_params',
          message: 'Informe um e-mail válido.' }, { status: 400 })
    }
    if (telefone.length < 10 || telefone.length > 11) {
      return NextResponse.json(
        { ok: false, code: 'invalid_params',
          message: 'Informe um telefone com DDD (ex: 11 91234-5678).' },
        { status: 400 })
    }
    // ── Turnstile FAIL-OPEN ──────────────────────────────────────
    // Não barra o usuário: se o desafio não validou (widget bloqueado,
    // token expirado, Cloudflare fora), o trial é criado do mesmo
    // jeito — só com o teto de IP mais apertado. Bot esbarra nas
    // outras camadas (e-mail normalizado, temp-mail, 1 trial por
    // MÁQUINA na ativação).
    let turnstileStatus: 'ok' | 'ausente' | 'falhou' = 'ausente'
    if (token) {
      const t = await validarTurnstile(token, ip)
      turnstileStatus = t.success ? 'ok' : 'falhou'
    }
    const limiteIp = turnstileStatus === 'ok'
      ? LIMITE_TRIALS_POR_IP_DIA
      : LIMITE_SEM_TURNSTILE_POR_IP_DIA

    // Temp-mail: a chave chega POR e-mail — descartável = abuso na certa
    if (ehEmailDescartavel(email)) {
      return NextResponse.json(
        { ok: false, code: 'email_descartavel',
          message: 'Use um e-mail de verdade — é nele que sua chave de '
            + 'ativação chega (e os avisos da sua licença também).' },
        { status: 400 })
    }

    await connectDB()

    // Rate-limit por IP: mais que N trials/24h no mesmo IP = farm
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const trialsDoIp = await Event.countDocuments({
      tipo: 'trial', 'dados.ip': ip, data: { $gte: desde },
    })
    if (trialsDoIp >= limiteIp) {
      return NextResponse.json(
        { ok: false, code: 'rate_limit',
          message: 'Muitos testes criados a partir desta conexão hoje. '
            + 'Tente novamente amanhã ou fale com o suporte.' },
        { status: 429 })
    }

    // 1 trial por e-mail — com NORMALIZAÇÃO anti-alias:
    // walter+2@gmail.com e w.alter@gmail.com contam como o mesmo e-mail
    const emailNorm = normalizarEmail(email)
    const existente = await License.findOne({
      $or: [{ email }, { email: emailNorm }, { email_norm: emailNorm }],
    })
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
      chave, email, nome, sobrenome, telefone,
      email_norm: emailNorm,
      order_id: `TRIAL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      status: 'inativa',            // ativa quando o app vincular a máquina
      plano: 'trial',
      expira_em: expira,
      origem: 'site',
    })
    await Event.create({
      tipo: 'trial', chave,
      dados: { email, nome, sobrenome, telefone, ip, dias: DIAS_TRIAL,
               turnstile: turnstileStatus },
    }).catch(() => {})

    try {
      await enviarEmailTrial(email, `${nome} ${sobrenome}`.trim(), chave, expira)
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
