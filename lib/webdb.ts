// ============================================================================
//  lib/webdb.ts — conexao com o banco do nfe-web (SaaS de NF-e).
//
//  Por que uma conexao separada e nao os modelos de lib/mongodb.ts:
//
//  Os dois bancos vivem no mesmo cluster do Atlas, mas sao produtos
//  diferentes — licenca vitalicia do desktop de um lado, assinatura mensal
//  do outro. Registrar os modelos do web na conexao default faria os dois
//  conjuntos disputarem o mesmo espaco de nomes do mongoose, e um
//  `mongoose.model('User')` de um lado apareceria no outro.
//
//  `createConnection` da um espaco proprio. Se WEB_MONGODB_URI nao estiver
//  configurada, a aba Web simplesmente nao funciona — o resto do painel
//  continua igual.
// ============================================================================

import mongoose from 'mongoose'

const URI = process.env.WEB_MONGODB_URI

let cache = (global as any).__webdb as {
  conn: mongoose.Connection | null
  modelos: any | null
} | undefined

if (!cache) cache = (global as any).__webdb = { conn: null, modelos: null }

export function webConfigurado(): boolean {
  return !!URI
}

/** Espelho MINIMO do schema do nfe-web — so o que o painel le ou escreve. */
const userSchema = new mongoose.Schema({
  id:                    { type: Number, index: true },
  username:              String,
  name:                  String,
  email:                 String,
  cnpj:                  String,
  phone:                 String,
  subscriptionStatus:    String,
  subscriptionExpiresAt: Date,
  asaasCustomerId:       String,
  asaasSubscriptionId:   String,
  gclid:                 String,
  gclidEm:               Date,
  tipo:                  String,
  afiliado: {
    codigo:   String,
    pixTipo:  String,
    pixChave: String,
    desde:    Date,
  },
  createdAt:             Date,
  updatedAt:             Date,
}, { collection: 'users', strict: false, versionKey: false })

const invoiceSchema = new mongoose.Schema({
  id:        Number,
  userId:    { type: Number, index: true },
  numero:    String,
  status:    String,
  total:     Number,
  createdAt: Date,
}, { collection: 'invoices', strict: false, versionKey: false })

const certificateSchema = new mongoose.Schema({
  userId:    { type: Number, index: true },
  name:      String,
  active:    Boolean,
  expiresAt: Date,
}, { collection: 'certificates', strict: false, versionKey: false })

const emitterSchema = new mongoose.Schema({
  userId:      { type: Number, index: true },
  razaoSocial: String,
  cnpj:        String,
  uf:          String,
  ambiente:    String,
}, { collection: 'emitters', strict: false, versionKey: false })

/**
 * Saques pedidos pelos parceiros.
 *
 * O nfe-web grava o pedido; o painel só lê e dá baixa. A chave Pix vem
 * copiada de lá, do momento do pedido — se o parceiro trocar depois, o
 * histórico continua mostrando para onde o dinheiro foi.
 */
const saqueSchema = new mongoose.Schema({
  parceiroUserId: Number,
  valor:      Number,
  pixTipo:    String,
  pixChave:   String,
  situacao:   String,
  indicacoes: [Number],
  comprovante: String,
  pedidoEm:   Date,
  pagoEm:     Date,
}, { collection: 'saques', strict: false, versionKey: false })

const indicacaoSchema = new mongoose.Schema({
  codigo:         String,
  parceiroUserId: { type: Number, index: true },
  indicadoUserId: Number,
  cnpj:           String,
  situacao:       String,
  valorPrimeira:  Number,
  valorSegunda:   Number,
  liberaEm:       Date,
  pagouEm:        Date,
  criadoEm:       Date,
}, { collection: 'indicacoes', strict: false, versionKey: false })

/**
 * Trilha do que o painel alterou.
 *
 * Fica no banco do WEB de proposito: quem for auditar uma conta olha o
 * banco daquela conta, nao precisa saber que existe um painel noutro
 * lugar. `strict: false` nos schemas acima serve ao mesmo fim — o painel
 * nunca apaga campo que nao conhece.
 */
const auditoriaSchema = new mongoose.Schema({
  quando:  { type: Date, default: Date.now, index: true },
  quem:    String,
  acao:    String,
  userId:  Number,
  antes:   mongoose.Schema.Types.Mixed,
  depois:  mongoose.Schema.Types.Mixed,
}, { collection: 'auditoriaadmin', versionKey: false })

export async function web() {
  if (!URI) throw new Error('WEB_MONGODB_URI nao configurada.')
  if (cache!.modelos) return cache!.modelos

  if (!cache!.conn) {
    cache!.conn = mongoose.createConnection(URI, { bufferCommands: false })
    await cache!.conn.asPromise()
  }
  const c = cache!.conn!

  cache!.modelos = {
    User:        c.models.User        || c.model('User', userSchema),
    Invoice:     c.models.Invoice     || c.model('Invoice', invoiceSchema),
    Certificate: c.models.Certificate || c.model('Certificate', certificateSchema),
    Emitter:     c.models.Emitter     || c.model('Emitter', emitterSchema),
    Auditoria:   c.models.Auditoria   || c.model('Auditoria', auditoriaSchema),
    Saque:       c.models.Saque       || c.model('Saque', saqueSchema),
    Indicacao:   c.models.Indicacao   || c.model('Indicacao', indicacaoSchema),
  }
  return cache!.modelos
}
