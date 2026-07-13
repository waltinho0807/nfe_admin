// app/api/tiktok/callback/route.ts
// GET ?code=&state=  — Redirect URL configurada no Partner Center.
// Troca o auth code por tokens, descobre a loja autorizada e grava
// tudo vinculado à licença (que veio assinada no state).
// Responde HTML simples (é aberto no navegador do cliente).
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { mockAtivo, trocarAuthCode, lojasAutorizadas } from '@/lib/tiktok'

function html(titulo: string, corpo: string, okStatus = 200) {
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
     <title>${titulo}</title>
     <style>body{font-family:system-ui;background:#0f1115;color:#e8e8e8;
       display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
       .card{background:#1a1d24;padding:40px 48px;border-radius:12px;
       max-width:460px;text-align:center}h1{font-size:20px}</style></head>
     <body><div class="card"><h1>${titulo}</h1><p>${corpo}</p></div></body></html>`,
    { status: okStatus, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export async function GET(req: NextRequest) {
  try {
    if (mockAtivo() && req.nextUrl.searchParams.get('mock') === '1') {
      return html('✅ Loja conectada (modo demonstração)',
        'Volte ao NF-e Desktop e clique em "Atualizar pedidos".')
    }
    const code  = req.nextUrl.searchParams.get('code')  || ''
    const state = req.nextUrl.searchParams.get('state') || ''
    if (!code || !state) {
      return html('Parâmetros ausentes',
        'Esta página deve ser aberta pelo fluxo de autorização do TikTok.', 400)
    }
    let chave = ''
    try {
      chave = (jwt.verify(state, process.env.JWT_SECRET!) as any)?.chave || ''
    } catch {
      return html('Sessão expirada',
        'O link de autorização expirou. Volte ao app e clique em ' +
        '"Conectar loja" de novo.', 400)
    }
    const tokens = await trocarAuthCode(code)
    const lojas = await lojasAutorizadas(tokens.access_token)
    const loja = lojas[0]
    const db = await import('@/lib/tiktok-db')
    await db.salvarConexao(chave, { tokens, shop: loja })
    return html('✅ Loja conectada!',
      `${loja?.name || 'Sua loja'} foi vinculada ao NF-e Desktop. ` +
      'Pode fechar esta janela e voltar ao app.')
  } catch (err: any) {
    console.error('Erro em /tiktok/callback:', err)
    return html('Falha ao conectar',
      `Não foi possível concluir a autorização: ${err?.message || err}. ` +
      'Tente de novo no app.', 500)
  }
}
