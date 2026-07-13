// lib/tiktok-db.ts
//
// Camada de DADOS da integração TikTok (mongoose). Fica SEPARADA do
// lib/tiktok.ts de propósito: o lib/mongodb.ts lança erro no import se
// MONGODB_URI não existir, então as rotas só importam ESTE módulo
// dinamicamente no caminho real (modo mock roda sem Mongo nenhum).

import mongoose from 'mongoose'
import { connectDB, License, Event } from './mongodb'
import { validarFormatoChave } from './license'
import type { Tokens } from './tiktok'

// ── Model: loja TikTok conectada, vinculada à LICENÇA ────────────────

const TikTokConnectionSchema = new mongoose.Schema({
  licenca:        { type: String, required: true, unique: true, index: true },
  shop_id:        { type: String, default: '' },
  shop_nome:      { type: String, default: '' },
  shop_cipher:    { type: String, default: '' },
  region:         { type: String, default: 'BR' },
  access_token:   { type: String, default: '' },
  access_expira:  { type: Number, default: 0 },   // epoch segundos
  refresh_token:  { type: String, default: '' },
  refresh_expira: { type: Number, default: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })

export const TikTokConnection =
  mongoose.models.TikTokConnection ||
  mongoose.model('TikTokConnection', TikTokConnectionSchema)

// ── Validação de licença (mesma regra do /api/license/validate) ──────

export interface ResultadoLicenca {
  ok: boolean
  status: number
  erro?: string
}

export async function validarLicencaTikTok(
  chave: string, maquina: string,
): Promise<ResultadoLicenca> {
  if (!validarFormatoChave(chave) || !maquina) {
    return { ok: false, status: 400, erro: 'Licença ou máquina inválida.' }
  }
  await connectDB()
  const lic = await License.findOne({ chave })
  if (!lic) {
    return { ok: false, status: 404, erro: 'Licença não encontrada.' }
  }
  if (lic.status === 'revogada' || lic.status === 'suspensa') {
    return { ok: false, status: 403, erro: `Licença ${lic.status}.` }
  }
  if (lic.machine_id && lic.machine_id !== maquina) {
    return { ok: false, status: 403,
             erro: 'Licença ativada em outra máquina.' }
  }
  return { ok: true, status: 200 }
}

// ── Conexão da loja: buscar / gravar / atualizar tokens ──────────────

export async function obterConexao(licenca: string) {
  await connectDB()
  return TikTokConnection.findOne({ licenca })
}

export async function salvarConexao(licenca: string, dados: {
  tokens: Tokens
  shop?: { id: string; name: string; cipher: string; region?: string }
}) {
  await connectDB()
  const set: Record<string, unknown> = {
    access_token:   dados.tokens.access_token,
    access_expira:  dados.tokens.access_expira,
    refresh_token:  dados.tokens.refresh_token,
    refresh_expira: dados.tokens.refresh_expira,
  }
  if (dados.shop) {
    set.shop_id     = dados.shop.id
    set.shop_nome   = dados.shop.name
    set.shop_cipher = dados.shop.cipher
    set.region      = dados.shop.region || 'BR'
  }
  await TikTokConnection.updateOne(
    { licenca }, { $set: set }, { upsert: true })
  await Event.create({
    tipo: 'validacao', chave: licenca,
    dados: { origem: 'tiktok', shop: dados.shop?.id || '' },
  }).catch(() => {})
}

// Garante access_token válido; renova se faltar < 15 min pra expirar.
export async function garantirToken(conn: any): Promise<any> {
  const agora = Math.floor(Date.now() / 1000)
  if (conn.access_token && conn.access_expira - agora > 15 * 60) {
    return conn
  }
  const { renovarToken } = await import('./tiktok')
  const tokens = await renovarToken(conn.refresh_token)
  await salvarConexao(conn.licenca, { tokens })
  conn.access_token   = tokens.access_token
  conn.access_expira  = tokens.access_expira
  conn.refresh_token  = tokens.refresh_token
  conn.refresh_expira = tokens.refresh_expira
  return conn
}
