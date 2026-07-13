// lib/billing.ts
//
// Regras do modelo de negócio (GATEWAY-AGNÓSTICO).
// O Mercado Pago (ou qualquer gateway futuro) só chama ativarAssinatura /
// desativarPorEstorno — trocar de gateway = escrever 1 webhook novo,
// nada aqui muda.
//
// Preços decididos AQUI (no servidor), pela situação da licença:
//   trial  → 1º ano promocional
//   anual  → renovação (max(hoje, expira_em) + 365d — renovar antes
//            de vencer SOMA os dias, nunca rouba)
//   vitalícia → não compra (já tem tudo)

import mongoose from 'mongoose'
import { connectDB, License, Event } from './mongodb'

export const PRECO_PRIMEIRO_ANO = 39.90
export const PRECO_RENOVACAO    = 149.00
export const DIAS_ANO           = 365
export const DIAS_TRIAL         = 15

export function mockAtivo(): boolean {
  return process.env.MP_MOCK === '1'
}

// ── Regra pura da expiração (testável sem banco) ─────────────────────

export function calcularNovaExpiracao(
  atual: Date | null | undefined,
  agora: Date = new Date(),
): Date {
  const base = atual && atual.getTime() > agora.getTime() ? atual : agora
  const nova = new Date(base)
  nova.setDate(nova.getDate() + DIAS_ANO)
  return nova
}

export function calcularExpiracaoTrial(agora: Date = new Date()): Date {
  const d = new Date(agora)
  d.setDate(d.getDate() + DIAS_TRIAL)
  return d
}

export interface SituacaoPreco {
  pode_comprar: boolean
  valor: number | null
  titulo: string
}

export function precoParaLicenca(lic: {
  plano?: string | null
}): SituacaoPreco {
  const plano = lic?.plano || 'vitalicia'
  if (plano === 'vitalicia') {
    return { pode_comprar: false, valor: null,
             titulo: 'Licença vitalícia — nada a pagar' }
  }
  if (plano === 'trial') {
    return { pode_comprar: true, valor: PRECO_PRIMEIRO_ANO,
             titulo: 'NF-e Desktop — 1º ano (oferta de lançamento)' }
  }
  return { pode_comprar: true, valor: PRECO_RENOVACAO,
           titulo: 'NF-e Desktop — renovação anual' }
}

// ── Registro de pagamentos (idempotência por pagamento_id único) ─────

const PaymentSchema = new mongoose.Schema({
  pagamento_id: { type: String, required: true, unique: true, index: true },
  gateway:      { type: String, required: true },   // 'mercadopago' | 'mock'
  chave:        { type: String, required: true, index: true },
  valor:        { type: Number, default: 0 },
  status:       { type: String, default: 'approved' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })

export const Payment =
  mongoose.models.Payment || mongoose.model('Payment', PaymentSchema)

// ── Ativação (chamada pelos webhooks) ────────────────────────────────

export interface ResultadoAtivacao {
  ok: boolean
  ja_processado?: boolean
  expira_em?: Date
  erro?: string
}

export async function ativarAssinatura(dados: {
  chave: string
  gateway: string
  pagamento_id: string
  valor?: number
}): Promise<ResultadoAtivacao> {
  await connectDB()

  // Idempotência: o índice único segura reentregas de webhook.
  try {
    await Payment.create({
      pagamento_id: dados.pagamento_id,
      gateway: dados.gateway,
      chave: dados.chave,
      valor: dados.valor ?? 0,
      status: 'approved',
    })
  } catch (err: any) {
    if (err?.code === 11000) {
      const lic = await License.findOne({ chave: dados.chave })
      return { ok: true, ja_processado: true,
               expira_em: lic?.expira_em ?? undefined }
    }
    throw err
  }

  const lic = await License.findOne({ chave: dados.chave })
  if (!lic) return { ok: false, erro: 'Licença não encontrada.' }

  const novaExpiracao = calcularNovaExpiracao(lic.expira_em)
  await License.updateOne({ chave: dados.chave }, {
    $set: {
      plano: 'anual',
      expira_em: novaExpiracao,
      lembretes_enviados: [],       // zera pro próximo ciclo de lembretes
    },
  })
  await Event.create({
    tipo: 'pagamento', chave: dados.chave,
    dados: { gateway: dados.gateway, pagamento_id: dados.pagamento_id,
             valor: dados.valor, expira_em: novaExpiracao },
  }).catch(() => {})

  // E-mail de confirmação (best-effort — não derruba o webhook)
  try {
    const { enviarEmailPagamento } = await import('./email')
    await enviarEmailPagamento(lic.email, lic.nome, novaExpiracao)
  } catch (e) {
    console.error('Falha ao enviar email de pagamento:', e)
  }

  return { ok: true, expira_em: novaExpiracao }
}

export async function desativarPorEstorno(
  pagamento_id: string, motivo: string,
): Promise<void> {
  await connectDB()
  const pg = await Payment.findOne({ pagamento_id })
  if (!pg) return
  await Payment.updateOne({ pagamento_id }, { $set: { status: 'refunded' } })
  // Corta o acesso na hora (o cliente foi reembolsado)
  await License.updateOne(
    { chave: pg.chave, plano: { $ne: 'vitalicia' } },
    { $set: { expira_em: new Date() } })
  await Event.create({
    tipo: 'revogacao', chave: pg.chave,
    dados: { motivo: `Estorno/chargeback: ${motivo}`, pagamento_id },
  }).catch(() => {})
}
