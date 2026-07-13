// app/api/tiktok/nfe/route.ts
// POST { chave, maquina, order_id, chave_acesso, xml }
//   →  { ok, etiqueta_liberada }
// Envia a NF-e autorizada de volta ao TikTok (libera a etiqueta).
// O endpoint BR real entra em TIKTOK_INVOICE_PATH (Fase 0 §0.3).
import { NextRequest, NextResponse } from 'next/server'
import { mockAtivo, enviarNfeTikTok } from '@/lib/tiktok'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const orderId = String(body?.order_id || '').trim()
    const chaveAcesso = String(body?.chave_acesso || '').replace(/\D/g, '')
    const xml = String(body?.xml || '')

    if (!orderId || chaveAcesso.length !== 44 || !xml.includes('<')) {
      return NextResponse.json(
        { ok: false, erro: 'Parâmetros inválidos (order_id, chave_acesso ' +
          'de 44 dígitos e xml são obrigatórios).' }, { status: 400 })
    }
    if (mockAtivo()) {
      return NextResponse.json({ ok: true, etiqueta_liberada: true })
    }
    const chave   = String(body?.chave   || '').trim().toUpperCase()
    const maquina = String(body?.maquina || '').trim()
    const db = await import('@/lib/tiktok-db')
    const lic = await db.validarLicencaTikTok(chave, maquina)
    if (!lic.ok) {
      return NextResponse.json({ ok: false, erro: lic.erro }, { status: lic.status })
    }
    let conn = await db.obterConexao(chave)
    if (!conn || !conn.refresh_token) {
      return NextResponse.json({ ok: false, erro: 'Loja não conectada.' })
    }
    conn = await db.garantirToken(conn)
    await enviarNfeTikTok(
      { access_token: conn.access_token, shop_cipher: conn.shop_cipher },
      orderId, chaveAcesso, xml)
    return NextResponse.json({ ok: true, etiqueta_liberada: true })
  } catch (err: any) {
    console.error('Erro em /tiktok/nfe:', err)
    return NextResponse.json(
      { ok: false, erro: err?.message || 'Erro ao enviar a NF-e.' },
      { status: 500 })
  }
}
