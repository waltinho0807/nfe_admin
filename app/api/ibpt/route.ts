// app/api/ibpt/route.ts
//
// Serve a tabela IBPT (alíquotas de tributos aproximados) de UM estado.
// O app desktop chama este endpoint pra baixar a tabela do estado do
// emitente, valida a licença antes de servir (só cliente pago baixa).
//
// POST { chave, machine_id, uf }
//   → valida a licença (mesma regra do /validate)
//   → retorna { versao, vigencia_inicio, vigencia_fim, aliquotas: [...] }
//
// GET ?versao=1  → só retorna a versão vigente da tabela (sem licença),
//                  pro app checar se precisa atualizar antes de baixar tudo.

import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License, IbptAliquota, IbptMeta } from '@/lib/mongodb'
import { validarFormatoChave } from '@/lib/license'

// UFs válidas (evita query desnecessária com lixo)
const UFS = new Set([
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
])

// ── GET: versão vigente (leve, sem licença) ──────────────────────────
// O app usa isso pra decidir se a tabela local está desatualizada.
export async function GET() {
  try {
    await connectDB()
    const meta = await IbptMeta.find({}).lean()
    const out: Record<string, string> = {}
    for (const m of meta as any[]) out[m.chave] = m.valor
    return NextResponse.json({
      ok: true,
      versao:          out.versao || '',
      vigencia_inicio: out.vigencia_inicio || '',
      vigencia_fim:    out.vigencia_fim || '',
      ufs:             out.ufs || '',
    })
  } catch (err) {
    console.error('Erro em GET /ibpt:', err)
    return NextResponse.json({ ok: false, code: 'server_error' }, { status: 500 })
  }
}

// ── POST: baixar a tabela de um estado (valida licença) ──────────────
export async function POST(req: NextRequest) {
  try {
    await connectDB()

    const body       = await req.json()
    const chave      = (body?.chave      || '').trim().toUpperCase()
    const machine_id = (body?.machine_id || '').trim()
    const uf         = (body?.uf         || '').trim().toUpperCase()

    // 1. Valida parâmetros
    if (!validarFormatoChave(chave) || !machine_id) {
      return NextResponse.json({ ok: false, code: 'invalid_params' }, { status: 400 })
    }
    if (!UFS.has(uf)) {
      return NextResponse.json({ ok: false, code: 'invalid_uf' }, { status: 400 })
    }

    // 2. Valida licença (mesma regra do /validate)
    const license = await License.findOne({ chave })
    if (!license) {
      return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 })
    }
    if (license.status === 'revogada') {
      return NextResponse.json({ ok: false, code: 'revoked' }, { status: 403 })
    }
    if (license.status === 'suspensa') {
      return NextResponse.json({ ok: false, code: 'suspended' }, { status: 403 })
    }
    if (license.machine_id && license.machine_id !== machine_id) {
      return NextResponse.json({ ok: false, code: 'machine_mismatch' }, { status: 403 })
    }

    // 3. Busca a tabela do estado
    const docs = await IbptAliquota.find({ uf })
      .select('ncm ex nacional_federal importado_federal estadual municipal -_id')
      .lean()

    if (!docs || docs.length === 0) {
      return NextResponse.json({ ok: false, code: 'uf_sem_dados' }, { status: 404 })
    }

    // 4. Metadados (versão/vigência)
    const meta = await IbptMeta.find({}).lean()
    const m: Record<string, string> = {}
    for (const x of meta as any[]) m[x.chave] = x.valor

    // 5. Resposta compacta — array de tuplas pra reduzir tamanho
    //    Cada item: [ncm, ex, fed_nac, fed_imp, est, mun]
    const aliquotas = (docs as any[]).map(d => [
      d.ncm, d.ex || '',
      d.nacional_federal, d.importado_federal,
      d.estadual, d.municipal,
    ])

    return NextResponse.json({
      ok: true,
      uf,
      versao:          m.versao || '',
      vigencia_inicio: m.vigencia_inicio || '',
      vigencia_fim:    m.vigencia_fim || '',
      fonte:           m.fonte || 'IBPT',
      total:           aliquotas.length,
      aliquotas,
    })

  } catch (err) {
    console.error('Erro em POST /ibpt:', err)
    return NextResponse.json({ ok: false, code: 'server_error' }, { status: 500 })
  }
}
