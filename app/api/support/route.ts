// app/api/support/route.ts
//
// Recebe as mensagens do formulário de suporte do site público.
// Esta rota é PÚBLICA (não exige login admin) — mas é protegida por:
//   1. Validação do Turnstile (anti-spam)
//   2. Honeypot (campo _website que bots preenchem)
//   3. Validação básica dos campos
//
// O site (calegarisistemas.com.br) faz POST aqui via /api/feedback-proxy.
import { NextRequest, NextResponse } from 'next/server'
import { connectDB, Ticket } from '@/lib/mongodb'
import { gerarTicketIdUnico } from '@/lib/ticket'
import { validarTurnstile } from '@/lib/turnstile'

// CORS: permite o site público postar aqui.
// Ajuste ALLOWED_ORIGIN se o domínio mudar.
const ALLOWED_ORIGINS = [
  'https://calegarisistemas.com.br',
  'https://www.calegarisistemas.com.br',
  'http://localhost:3000', // dev
]

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

// Preflight CORS
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get('origin')),
  })
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  try {
    const body = await req.json()
    const {
      name, email, phone, category, message,
      _website,                 // honeypot
      turnstile_token,
      attachments,
    } = body

    // 1. Honeypot — se preenchido, é bot. Finge sucesso e descarta.
    if (_website && String(_website).trim() !== '') {
      return NextResponse.json(
        { success: true, ticket_id: 'TKT-IGNORED' },
        { headers: cors },
      )
    }

    // 2. Validação básica
    if (!name || !email || !message) {
      return NextResponse.json(
        { error: 'Nome, email e mensagem são obrigatórios' },
        { status: 400, headers: cors },
      )
    }
    if (String(message).trim().length < 10) {
      return NextResponse.json(
        { error: 'Mensagem muito curta' },
        { status: 400, headers: cors },
      )
    }

    // 3. Valida Turnstile (anti-spam)
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      ''
    const turnstile = await validarTurnstile(turnstile_token, ip)
    if (!turnstile.success) {
      console.warn('[support] Turnstile falhou:', turnstile.reason)
      return NextResponse.json(
        { error: 'Verificação anti-spam falhou. Recarregue e tente de novo.' },
        { status: 403, headers: cors },
      )
    }

    // 4. Categoria válida (senão cai em 'other')
    const catsValidas = ['bug', 'doubt', 'suggestion', 'other']
    const categoria = catsValidas.includes(category) ? category : 'other'

    // 5. Sanitiza anexos (aceita só os campos esperados)
    const anexos = Array.isArray(attachments)
      ? attachments.slice(0, 3).map((a: any) => ({
          url: String(a?.url || ''),
          filename: String(a?.filename || ''),
          size: Number(a?.size || 0),
          mime_type: String(a?.mime_type || ''),
        })).filter((a) => a.url)
      : []

    // 6. Grava o ticket
    await connectDB()
    const ticket_id = await gerarTicketIdUnico()
    await Ticket.create({
      ticket_id,
      nome: String(name).slice(0, 120),
      email: String(email).slice(0, 160).toLowerCase(),
      telefone: String(phone || '').slice(0, 30),
      categoria,
      mensagem: String(message).slice(0, 4000),
      anexos,
      status: 'novo',
      turnstile_ok: turnstile.reason !== 'secret-nao-configurada',
      ip,
      user_agent: req.headers.get('user-agent') || '',
    })

    return NextResponse.json(
      { success: true, ticket_id },
      { headers: cors },
    )
  } catch (err) {
    console.error('[support] erro ao processar:', err)
    return NextResponse.json(
      { error: 'Erro ao processar. Tente novamente em instantes.' },
      { status: 500, headers: cors },
    )
  }
}
