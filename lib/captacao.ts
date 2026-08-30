// ============================================================================
//  lib/captacao.ts — contatos de captação e histórico de envio.
//
//  Mora no banco do PAINEL, não no do nfe-web: é dado comercial seu, não
//  dado de cliente. Misturar os dois deixaria a base de clientes com
//  registros que não são clientes.
//
//  O histórico é o que realmente importa aqui. Sem ele você reescreve para
//  quem já respondeu não, esquece de dar seguimento em quem não respondeu,
//  e manda o mesmo texto duas vezes para a mesma pessoa — que é a forma
//  mais rápida de queimar um contato.
// ============================================================================

import mongoose from 'mongoose'

const URI = process.env.MONGODB_URI

let cache = (global as any).__captacao as {
  conn: mongoose.Connection | null; modelos: any | null
} | undefined
if (!cache) cache = (global as any).__captacao = { conn: null, modelos: null }

export type TipoContato = 'influenciador' | 'contador' | 'parceiro' | 'outro'
export type SituacaoContato =
  | 'novo' | 'contatado' | 'respondeu' | 'negociando' | 'fechado' | 'recusou'

const contatoSchema = new mongoose.Schema({
  nome:      { type: String, required: true },
  email:     { type: String, required: true, lowercase: true, trim: true },
  tipo:      { type: String, default: 'influenciador', index: true },
  /** Canal, perfil ou empresa — o que ajuda a lembrar quem é. */
  canal:     String,
  /** Tamanho da audiência, quando fizer sentido. Texto livre: "55,7 mil". */
  audiencia: String,
  /** O vídeo ou assunto citado no e-mail — evita repetir na segunda tentativa. */
  referencia: String,
  observacoes: String,
  situacao:  { type: String, default: 'novo', index: true },
  criadoEm:  { type: Date, default: Date.now },
  /** Preenchidos a partir do histórico, para ordenar a lista. */
  ultimoEnvioEm: { type: Date, default: null },
  enviosFeitos:  { type: Number, default: 0 },
}, { collection: 'contatoscaptacao', versionKey: false })

// Um contato por e-mail. Sem isso, importar a mesma lista duas vezes
// duplica todo mundo e o histórico perde o sentido.
contatoSchema.index({ email: 1 }, { unique: true })

const envioSchema = new mongoose.Schema({
  contatoId: { type: String, index: true },
  email:     String,
  modelo:    String,
  assunto:   String,
  corpo:     String,
  enviadoEm: { type: Date, default: Date.now },
  ok:        { type: Boolean, default: true },
  erro:      String,
}, { collection: 'enviocaptacao', versionKey: false })

/**
 * Resposta de um contato, recebida pelo webhook do Resend.
 *
 * Guardada aqui, e não só no painel do Resend, porque lá some em 30 dias —
 * e a conversa com um criador pode levar mais que isso.
 */
const respostaSchema = new mongoose.Schema({
  contatoId: { type: String, default: null, index: true },
  de:        { type: String, index: true },
  assunto:   String,
  texto:     String,
  recebidoEm:{ type: Date, default: Date.now },
  lida:      { type: Boolean, default: false },
  /** id do Resend, para não gravar o mesmo e-mail duas vezes. */
  externoId: { type: String, index: true },
}, { collection: 'respostascaptacao', versionKey: false })

export function captacaoConfigurada(): boolean {
  return !!URI
}

export async function captacao() {
  if (!URI) throw new Error('MONGODB_URI não configurada.')
  if (cache!.modelos) return cache!.modelos
  if (!cache!.conn) {
    cache!.conn = mongoose.createConnection(URI, { bufferCommands: false })
    await cache!.conn.asPromise()
  }
  const c = cache!.conn!
  cache!.modelos = {
    Contato: c.models.Contato || c.model('Contato', contatoSchema),
    Envio:   c.models.Envio   || c.model('Envio', envioSchema),
    Resposta: c.models.Resposta || c.model('Resposta', respostaSchema),
  }
  return cache!.modelos
}
