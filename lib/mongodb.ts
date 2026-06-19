// lib/mongodb.ts
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI!

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI nao definida nas variaveis de ambiente')
}

// Cache da conexao para reutilizar entre requests (padrao Next.js)
let cached = (global as any).mongoose as {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null }
}

export async function connectDB() {
  if (cached.conn) return cached.conn

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    })
  }

  cached.conn = await cached.promise
  return cached.conn
}

// ── Schemas ──────────────────────────────────────────────────────────

const LicenseSchema = new mongoose.Schema({
  chave:         { type: String, required: true, unique: true, index: true },
  email:         { type: String, required: true, index: true },
  nome:          { type: String, required: true },
  order_id:      { type: String, required: true, unique: true },
  status:        {
    type: String,
    enum: ['inativa', 'ativa', 'revogada', 'suspensa'],
    default: 'inativa'
  },
  machine_id:    { type: String, default: null },
  data_compra:   { type: Date, default: Date.now },
  data_ativacao: { type: Date, default: null },
  ultimo_acesso: { type: Date, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })

const ActivationSchema = new mongoose.Schema({
  chave:      { type: String, required: true, index: true },
  machine_id: { type: String, required: true },
  ip:         { type: String },
  user_agent: { type: String },
  data:       { type: Date, default: Date.now },
})

const EventSchema = new mongoose.Schema({
  tipo:  {
    type: String,
    enum: ['compra', 'ativacao', 'validacao', 'revogacao', 'reset_senha', 'erro'],
    required: true
  },
  chave: { type: String, index: true },
  dados: { type: mongoose.Schema.Types.Mixed },
  ip:    { type: String },
  data:  { type: Date, default: Date.now },
})

// ── Tickets de suporte (mensagens vindas do formulário do site) ──────
const TicketSchema = new mongoose.Schema({
  // ticket_id legível pro cliente (TKT-XXXXXX) — gerado na criação
  ticket_id:  { type: String, required: true, unique: true, index: true },
  nome:       { type: String, required: true },
  email:      { type: String, required: true, index: true },
  telefone:   { type: String, default: '' },
  categoria:  {
    type: String,
    enum: ['bug', 'doubt', 'suggestion', 'other'],
    default: 'other',
    index: true,
  },
  mensagem:   { type: String, required: true },
  // anexos: array de { url, filename, size, mime_type } (do Vercel Blob)
  anexos:     { type: [mongoose.Schema.Types.Mixed], default: [] },
  status:     {
    type: String,
    enum: ['novo', 'em_andamento', 'resolvido'],
    default: 'novo',
    index: true,
  },
  // se o Turnstile foi validado com sucesso no servidor
  turnstile_ok: { type: Boolean, default: false },
  ip:         { type: String, default: '' },
  user_agent: { type: String, default: '' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })

// ── Tabela IBPT (alíquotas de tributos aproximados por NCM/UF) ───────
// Usada pra calcular o "Valor Aproximado dos Tributos" (Lei 12.741) que
// aparece na DANFE. Dados oficiais do IBPT, importados periodicamente
// via scripts/importar-ibpt.ts. O app desktop baixa o estado do emitente
// pelo endpoint /api/ibpt e calcula localmente.
const IbptAliquotaSchema = new mongoose.Schema({
  uf:                { type: String, required: true },
  ncm:               { type: String, required: true },
  ex:                { type: String, default: '' },
  descricao:         { type: String, default: '' },
  nacional_federal:  { type: Number, default: 0 },
  importado_federal: { type: Number, default: 0 },
  estadual:          { type: Number, default: 0 },
  municipal:         { type: Number, default: 0 },
  vigencia_inicio:   { type: String, default: '' },
  vigencia_fim:      { type: String, default: '' },
  versao:            { type: String, default: '' },
})
// Índice composto pra busca rápida por estado (o app baixa um estado inteiro)
IbptAliquotaSchema.index({ uf: 1, ncm: 1 })

// Metadados da tabela IBPT carregada (versão vigente, etc.)
const IbptMetaSchema = new mongoose.Schema({
  chave: { type: String, required: true, unique: true },
  valor: { type: String, default: '' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })

// Evita redefinir modelos no hot-reload do Next.js
export const License    = mongoose.models.License    || mongoose.model('License',    LicenseSchema)
export const Activation = mongoose.models.Activation || mongoose.model('Activation', ActivationSchema)
export const Event      = mongoose.models.Event      || mongoose.model('Event',      EventSchema)
export const Ticket     = mongoose.models.Ticket     || mongoose.model('Ticket',     TicketSchema)
export const IbptAliquota = mongoose.models.IbptAliquota || mongoose.model('IbptAliquota', IbptAliquotaSchema)
export const IbptMeta     = mongoose.models.IbptMeta     || mongoose.model('IbptMeta',     IbptMetaSchema)
