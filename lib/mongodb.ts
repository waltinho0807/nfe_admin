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

// Evita redefinir modelos no hot-reload do Next.js
export const License    = mongoose.models.License    || mongoose.model('License',    LicenseSchema)
export const Activation = mongoose.models.Activation || mongoose.model('Activation', ActivationSchema)
export const Event      = mongoose.models.Event      || mongoose.model('Event',      EventSchema)
