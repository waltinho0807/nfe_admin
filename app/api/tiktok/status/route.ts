// app/api/tiktok/status/route.ts
// GET ?chave=&maquina=  →  { ok, conectado, loja }
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { mockAtivo } from '@/lib/tiktok'

export async function GET(req: NextRequest) {
  try {
    if (mockAtivo()) {
      return NextResponse.json({
        ok: true, conectado: true,
        loja: { shop_id: 'MOCK-001', nome: 'Loja Demonstração (mock)' },
      })
    }
    const chave   = (req.nextUrl.searchParams.get('chave')   || '').trim().toUpperCase()
    const maquina = (req.nextUrl.searchParams.get('maquina') || '').trim()
    const db = await import('@/lib/tiktok-db')
    const lic = await db.validarLicencaTikTok(chave, maquina)
    if (!lic.ok) {
      return NextResponse.json({ ok: false, erro: lic.erro }, { status: lic.status })
    }
    const conn = await db.obterConexao(chave)
    if (!conn || !conn.refresh_token) {
      return NextResponse.json({ ok: true, conectado: false, loja: null })
    }
    return NextResponse.json({
      ok: true, conectado: true,
      loja: { shop_id: conn.shop_id, nome: conn.shop_nome },
    })
  } catch (err) {
    console.error('Erro em /tiktok/status:', err)
    return NextResponse.json({ ok: false, erro: 'Erro interno.' }, { status: 500 })
  }
}
