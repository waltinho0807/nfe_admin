// app/api/checkout/route.ts
// GET ?chave=&maquina=  — aberto no NAVEGADOR pelo app (ou pelo e-mail).
// O PREÇO é decidido AQUI pela situação da licença:
//   trial → 1º ano promocional | anual → renovação | vitalícia → nada.
// Em MP_MOCK=1: página de pagamento simulado (testa o ciclo sem MP).
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License } from '@/lib/mongodb'
import { validarFormatoChave } from '@/lib/license'
import { precoParaLicenca, mockAtivo } from '@/lib/billing'
import { criarPreference } from '@/lib/mercadopago'

function html(titulo: string, corpo: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${titulo}</title>
     <style>body{font-family:system-ui;background:#0f1115;color:#e8e8e8;
       display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
       .card{background:#1a1d24;padding:40px 44px;border-radius:12px;
       max-width:480px;text-align:center}h1{font-size:20px;margin:0 0 12px}
       p{color:#b6bcc8;line-height:1.5}button{background:#2563eb;color:#fff;
       border:0;border-radius:8px;padding:12px 28px;font-size:15px;
       cursor:pointer;margin-top:12px}</style></head>
     <body><div class="card"><h1>${titulo}</h1>${corpo}</div></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export async function GET(req: NextRequest) {
  try {
    const chave = (req.nextUrl.searchParams.get('chave') || '')
      .trim().toUpperCase()
    if (!validarFormatoChave(chave)) {
      return html('Chave inválida',
        '<p>Abra esta página pelo botão <b>Assinar</b> dentro do NF-e Desktop.</p>', 400)
    }
    await connectDB()
    const lic = await License.findOne({ chave })
    if (!lic) {
      return html('Licença não encontrada',
        '<p>Verifique a chave no app (página Licença) e tente de novo.</p>', 404)
    }
    if (lic.status === 'revogada' || lic.status === 'suspensa') {
      return html('Licença bloqueada',
        '<p>Esta licença está bloqueada. Fale com o suporte.</p>', 403)
    }
    const preco = precoParaLicenca(lic)
    if (!preco.pode_comprar || !preco.valor) {
      return html('Você já tem licença vitalícia 🎉',
        '<p>Não há nada a pagar — seu NF-e Desktop é seu pra sempre.</p>')
    }

    const origin = req.nextUrl.origin
    if (mockAtivo()) {
      // Pagamento SIMULADO (preview): botão dispara o webhook mock
      return html(`Checkout simulado — R$ ${preco.valor.toFixed(2).replace('.', ',')}`,
        `<p>${preco.titulo}</p>
         <p style="font-size:13px;color:#8b93a1">Modo de teste (MP_MOCK=1)
         — nenhum valor será cobrado.</p>
         <form method="post" action="${origin}/api/webhook/mercadopago">
           <input type="hidden" name="mock" value="1">
           <input type="hidden" name="chave" value="${chave}">
           <input type="hidden" name="valor" value="${preco.valor}">
           <button type="submit">Simular pagamento aprovado</button>
         </form>`)
    }

    const pref = await criarPreference({
      chave,
      titulo: preco.titulo,
      valor: preco.valor,
      notificationUrl: `${origin}/api/webhook/mercadopago`,
      successUrl: process.env.SITE_URL
        ? `${process.env.SITE_URL}/sucesso?fluxo=assinatura`
        : `${origin}/api/checkout?chave=${chave}`,
    })
    if (!pref.ok || !pref.init_point) {
      console.error('Falha ao criar preferência MP:', pref.erro)
      return html('Pagamento indisponível',
        '<p>Não foi possível iniciar o pagamento agora. Tente novamente '
        + 'em alguns minutos.</p>', 502)
    }
    return NextResponse.redirect(pref.init_point, 302)
  } catch (err) {
    console.error('Erro em /api/checkout:', err)
    return html('Erro interno', '<p>Tente novamente em instantes.</p>', 500)
  }
}
