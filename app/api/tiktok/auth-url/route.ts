// app/api/tiktok/auth-url/route.ts
// GET ?chave=&maquina=  →  { ok, url }
// O state é um JWT curto com a licença — o callback usa pra saber a
// QUAL licença vincular os tokens (e impede conectar loja em licença alheia).
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { mockAtivo, cfg } from '@/lib/tiktok'

export async function GET(req: NextRequest) {
  try {
    const base = req.nextUrl.origin
    if (mockAtivo()) {
      return NextResponse.json({
        ok: true, url: `${base}/api/tiktok/callback?mock=1`,
      })
    }
    const chave   = (req.nextUrl.searchParams.get('chave')   || '').trim().toUpperCase()
    const maquina = (req.nextUrl.searchParams.get('maquina') || '').trim()
    const db = await import('@/lib/tiktok-db')
    const lic = await db.validarLicencaTikTok(chave, maquina)
    if (!lic.ok) {
      return NextResponse.json({ ok: false, erro: lic.erro }, { status: lic.status })
    }
    if (!cfg.serviceId()) {
      return NextResponse.json({
        ok: false,
        erro: 'TIKTOK_SERVICE_ID não configurado no servidor (Fase 0).',
      })
    }
    const state = jwt.sign({ chave }, process.env.JWT_SECRET!, { expiresIn: '15m' })
    const url = `${cfg.authBase()}?service_id=${encodeURIComponent(cfg.serviceId())}` +
                `&state=${encodeURIComponent(state)}`
    return NextResponse.json({ ok: true, url })
  } catch (err) {
    console.error('Erro em /tiktok/auth-url:', err)
    return NextResponse.json({ ok: false, erro: 'Erro interno.' }, { status: 500 })
  }
}
