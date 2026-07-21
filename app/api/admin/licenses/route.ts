// app/api/admin/license/route.ts
//
// Detalhes completos + EDIÇÃO de uma licença — substitui a necessidade
// de abrir o MongoDB Atlas na mão (onde um clique errado num campo
// tipado quebra a licença de um cliente).
//
//   GET   /api/admin/license?chave=XXXX  → ficha completa + histórico
//   PATCH /api/admin/license             → altera plano/expira_em/status
//
// Toda alteração vira Event (auditoria: quem mexeu, no quê, quando).

import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License, Activation, Event } from '@/lib/mongodb'
import { verificarAdmin, unauthorized } from '@/lib/auth'
import { somarDiasExpiracao } from '@/lib/billing'

const PLANOS  = ['vitalicia', 'anual', 'trial'] as const
const STATUS  = ['inativa', 'ativa', 'revogada', 'suspensa'] as const

// ─────────────────────────────────────────────────────────────────────
// GET — ficha completa do cliente
// ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  await connectDB()

  const chave = new URL(req.url).searchParams.get('chave') || ''
  if (!chave) {
    return NextResponse.json({ error: 'Chave obrigatoria' }, { status: 400 })
  }

  const license = await License.findOne({ chave }).lean()
  if (!license) {
    return NextResponse.json({ error: 'Chave nao encontrada' }, { status: 404 })
  }

  // Histórico: ativações desta chave + últimos eventos
  const [ativacoes, eventos] = await Promise.all([
    Activation.find({ chave }).sort({ data: -1 }).limit(10).lean(),
    Event.find({ chave }).sort({ data: -1 }).limit(15).lean(),
  ])

  // Dias restantes calculado no servidor (mesma regra do desktop)
  let dias_restantes: number | null = null
  const exp = (license as any).expira_em
  if (exp) {
    const ms = new Date(exp).getTime() - Date.now()
    dias_restantes = Math.max(0, Math.ceil(ms / 86400000))
  }

  return NextResponse.json({
    license: { ...license, dias_restantes },
    ativacoes,
    eventos,
  })
}

// ─────────────────────────────────────────────────────────────────────
// PATCH — edita a licença (o que antes exigia ir no Atlas)
// ─────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  await connectDB()

  const body = await req.json().catch(() => ({}))
  const chave = String(body?.chave || '').trim()
  if (!chave) {
    return NextResponse.json({ error: 'Chave obrigatoria' }, { status: 400 })
  }

  const license = await License.findOne({ chave })
  if (!license) {
    return NextResponse.json({ error: 'Chave nao encontrada' }, { status: 404 })
  }

  const update: any = {}
  const antes: any = {}
  const depois: any = {}

  // ── plano ──
  if (body.plano !== undefined) {
    const plano = String(body.plano)
    if (!PLANOS.includes(plano as any)) {
      return NextResponse.json(
        { error: `Plano invalido. Use: ${PLANOS.join(', ')}` }, { status: 400 })
    }
    antes.plano = license.plano
    depois.plano = plano
    update.plano = plano
    // Vitalícia NUNCA expira — zera a data pra manter a regra coerente
    if (plano === 'vitalicia') {
      antes.expira_em = license.expira_em
      depois.expira_em = null
      update.expira_em = null
    }
  }

  // ── expira_em (aceita ISO, 'YYYY-MM-DD' ou null) ──
  if (body.expira_em !== undefined && update.expira_em === undefined) {
    if (body.expira_em === null || body.expira_em === '') {
      antes.expira_em = license.expira_em
      depois.expira_em = null
      update.expira_em = null
    } else {
      const d = new Date(String(body.expira_em))
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: 'Data invalida' }, { status: 400 })
      }
      antes.expira_em = license.expira_em
      depois.expira_em = d
      update.expira_em = d
    }
  }

  // ── somar dias (atalhos +15d / +1 ano) ──
  if (body.somar_dias !== undefined) {
    const dias = parseInt(String(body.somar_dias), 10)
    if (isNaN(dias)) {
      return NextResponse.json({ error: 'somar_dias invalido' }, { status: 400 })
    }
    // Mesma regra do pagamento (lib/billing): soma na validade atual se
    // ela ainda está no futuro — não encurta quem renovou adiantado
    const nova = somarDiasExpiracao(license.expira_em, dias)
    antes.expira_em = license.expira_em
    depois.expira_em = nova
    update.expira_em = nova
  }

  // ── status ──
  if (body.status !== undefined) {
    const status = String(body.status)
    if (!STATUS.includes(status as any)) {
      return NextResponse.json(
        { error: `Status invalido. Use: ${STATUS.join(', ')}` }, { status: 400 })
    }
    antes.status = license.status
    depois.status = status
    update.status = status
  }

  // ── dados de contato (corrigir typo de cadastro) ──
  for (const campo of ['nome', 'sobrenome', 'telefone', 'email'] as const) {
    if (body[campo] !== undefined) {
      const val = String(body[campo]).trim()
      antes[campo] = (license as any)[campo]
      depois[campo] = val
      update[campo] = val
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada para alterar' }, { status: 400 })
  }

  await License.updateOne({ chave }, update)

  // Auditoria — o que mudou, de que valor pra qual
  await Event.create({
    tipo: 'edicao_admin', chave,
    dados: {
      email: license.email,
      antes, depois,
      motivo: String(body?.motivo || 'Editado pelo painel admin'),
    },
  }).catch(() => {})

  const atualizada = await License.findOne({ chave }).lean()
  return NextResponse.json({ success: true, license: atualizada })
}
