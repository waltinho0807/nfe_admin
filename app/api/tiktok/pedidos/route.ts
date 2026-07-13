// app/api/tiktok/pedidos/route.ts
// GET ?chave=&maquina=&status=AGUARDANDO_ENVIO
//   →  { ok, pedidos: [PEDIDO_NORMALIZADO, ...] }
// O adapter (lib/tiktok.adaptarPedido) traduz o JSON cru do TikTok —
// o desktop nunca vê campo cru.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { mockAtivo, pedidosMock, buscarPedidos, adaptarPedido } from '@/lib/tiktok'

export async function GET(req: NextRequest) {
  try {
    if (mockAtivo()) {
      return NextResponse.json({ ok: true, pedidos: pedidosMock() })
    }
    const chave   = (req.nextUrl.searchParams.get('chave')   || '').trim().toUpperCase()
    const maquina = (req.nextUrl.searchParams.get('maquina') || '').trim()
    const status  = (req.nextUrl.searchParams.get('status')  || 'AGUARDANDO_ENVIO').trim()

    const db = await import('@/lib/tiktok-db')
    const lic = await db.validarLicencaTikTok(chave, maquina)
    if (!lic.ok) {
      return NextResponse.json({ ok: false, erro: lic.erro }, { status: lic.status })
    }
    let conn = await db.obterConexao(chave)
    if (!conn || !conn.refresh_token) {
      return NextResponse.json({
        ok: false, erro: 'Loja não conectada. Use "Conectar loja" primeiro.',
      })
    }
    conn = await db.garantirToken(conn)
    const crus = await buscarPedidos(
      { access_token: conn.access_token, shop_cipher: conn.shop_cipher },
      status)
    const pedidos = crus.map(adaptarPedido).filter(p => p.order_id)
    return NextResponse.json({ ok: true, pedidos })
  } catch (err: any) {
    console.error('Erro em /tiktok/pedidos:', err)
    return NextResponse.json(
      { ok: false, erro: err?.message || 'Erro ao buscar pedidos.' },
      { status: 500 })
  }
}
