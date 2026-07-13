// lib/email.ts
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)
const FROM   = process.env.EMAIL_FROM ?? 'NF-e Desktop <noreply@seudominio.com.br>'

export async function enviarEmailAtivacao(
  email: string,
  nome: string,
  chave: string
): Promise<void> {
  const primeiroNome = nome.split(' ')[0]

  await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: 'Sua chave de ativação — NF-e Desktop',
    html:    `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1e40af;padding:32px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">NF-e Desktop</h1>
            <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px;">Emissor de Notas Fiscais</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 32px;">
            <p style="color:#374151;font-size:16px;margin:0 0 16px;">Olá, <strong>${primeiroNome}</strong>!</p>
            <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
              Sua compra foi confirmada. Aqui está sua chave de ativação vitalícia:
            </p>

            <!-- Chave destacada -->
            <div style="background:#f0f9ff;border:2px solid #0ea5e9;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px;">
              <p style="color:#64748b;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Sua chave de ativação</p>
              <p style="color:#0c4a6e;font-size:24px;font-weight:700;font-family:monospace;margin:0;letter-spacing:4px;">${chave}</p>
            </div>

            <!-- Instruções -->
            <p style="color:#374151;font-size:15px;font-weight:600;margin:0 0 12px;">Como ativar:</p>
            <ol style="color:#374151;font-size:14px;line-height:2;padding-left:20px;margin:0 0 24px;">
              <li>Abra o NF-e Desktop</li>
              <li>Na tela inicial, cole a chave acima</li>
              <li>Clique em <strong>Ativar</strong></li>
              <li>Pronto — use para sempre nesta máquina</li>
            </ol>

            <div style="background:#fefce8;border-left:4px solid #eab308;padding:16px;border-radius:4px;margin:0 0 24px;">
              <p style="color:#713f12;font-size:13px;margin:0;">
                <strong>Importante:</strong> Esta é uma licença vitalícia vinculada à sua máquina.
                Guarde este email em local seguro.
              </p>
            </div>

            <p style="color:#374151;font-size:14px;margin:0;">
              Qualquer dúvida, responda este email.<br>
              <strong>Equipe NF-e Desktop</strong>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">
              Este email foi enviado automaticamente após a confirmação da sua compra.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `,
  })
}

// ─────────────────────────────────────────────────────────────────────
// Novo modelo de negócio: trial, pagamento e lembretes
// ─────────────────────────────────────────────────────────────────────

function _shell(conteudo: string, rodape: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1e40af;padding:32px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">NF-e Desktop</h1>
            <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px;">Emissor de Notas Fiscais</p>
          </td>
        </tr>
        <tr><td style="padding:40px 32px;">${conteudo}</td></tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">${rodape}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function _blocoChave(chave: string): string {
  return `
<div style="background:#f0f9ff;border:2px solid #0ea5e9;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px;">
  <p style="color:#64748b;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Sua chave de ativação</p>
  <p style="color:#0c4a6e;font-size:24px;font-weight:700;font-family:monospace;margin:0;letter-spacing:4px;">${chave}</p>
</div>`
}

function _fmtData(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export async function enviarEmailTrial(
  email: string, nome: string, chave: string, expiraEm: Date,
): Promise<void> {
  const primeiroNome = nome.split(' ')[0]
  const download = process.env.DOWNLOAD_URL_WINDOWS || ''
  const btnDownload = download
    ? `<div style="text-align:center;margin:0 0 24px;">
         <a href="${download}" style="background:#1e40af;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;display:inline-block;">⬇ Baixar NF-e Desktop (Windows)</a>
       </div>`
    : ''
  await resend.emails.send({
    from: FROM, to: email,
    subject: 'Sua chave de teste grátis — NF-e Desktop',
    html: _shell(`
      <p style="color:#374151;font-size:16px;margin:0 0 16px;">Olá, <strong>${primeiroNome}</strong>!</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Seu teste grátis do NF-e Desktop está liberado. Você tem
        <strong>15 dias</strong> com tudo funcionando — emissão ilimitada,
        DANFE, tributos automáticos.
      </p>
      ${_blocoChave(chave)}
      ${btnDownload}
      <p style="color:#374151;font-size:15px;font-weight:600;margin:0 0 12px;">Como começar:</p>
      <ol style="color:#374151;font-size:14px;line-height:2;padding-left:20px;margin:0 0 24px;">
        <li>Baixe e instale o NF-e Desktop</li>
        <li>Na tela inicial, cole a chave acima e clique em <strong>Ativar</strong></li>
        <li>Configure seu emitente e emita sua primeira nota</li>
      </ol>
      <div style="background:#fefce8;border-left:4px solid #eab308;padding:16px;border-radius:4px;margin:0 0 24px;">
        <p style="color:#713f12;font-size:13px;margin:0;">
          Seu teste vale até <strong>${_fmtData(expiraEm)}</strong>. Depois
          disso, assine por <strong>R$ 39,90 no primeiro ano</strong> direto
          pelo app — suas notas e cadastros continuam intactos.
        </p>
      </div>
      <p style="color:#374151;font-size:14px;margin:0;">
        Qualquer dúvida, responda este email.<br>
        <strong>Equipe NF-e Desktop</strong>
      </p>`,
      'Você recebeu este email porque pediu o teste grátis no nosso site.'),
  })
}

export async function enviarEmailPagamento(
  email: string, nome: string, ateQuando: Date,
): Promise<void> {
  const primeiroNome = nome.split(' ')[0]
  await resend.emails.send({
    from: FROM, to: email,
    subject: 'Pagamento confirmado — NF-e Desktop ativo por 1 ano',
    html: _shell(`
      <p style="color:#374151;font-size:16px;margin:0 0 16px;">Olá, <strong>${primeiroNome}</strong>!</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
        Pagamento confirmado. Sua assinatura do NF-e Desktop está
        <strong>ativa até ${_fmtData(ateQuando)}</strong>.
      </p>
      <div style="background:#f0fdf4;border:2px solid #22c55e;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px;">
        <p style="color:#166534;font-size:16px;font-weight:700;margin:0;">✓ Tudo liberado — pode continuar emitindo normalmente</p>
      </div>
      <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Se o app estiver mostrando aviso de licença, abra a página
        <strong>Licença</strong> e clique em <strong>"Já paguei — verificar"</strong>.
      </p>
      <p style="color:#374151;font-size:14px;margin:0;">
        Obrigado por assinar!<br><strong>Equipe NF-e Desktop</strong>
      </p>`,
      'Comprovante da sua assinatura anual do NF-e Desktop.'),
  })
}

export async function enviarEmailLembrete(
  email: string, nome: string,
  dados: { dias: number; plano: 'trial' | 'anual'; checkoutUrl: string },
): Promise<void> {
  const primeiroNome = nome.split(' ')[0]
  const ehTrial = dados.plano === 'trial'
  const titulo = ehTrial
    ? (dados.dias <= 1 ? 'Seu teste grátis termina hoje'
                       : `Seu teste grátis termina em ${dados.dias} dias`)
    : (dados.dias <= 1 ? 'Sua assinatura vence hoje'
                       : `Sua assinatura vence em ${dados.dias} dias`)
  const cta = ehTrial ? 'Assinar por R$ 39,90 (1º ano)' : 'Renovar por R$ 149'
  await resend.emails.send({
    from: FROM, to: email,
    subject: `${titulo} — NF-e Desktop`,
    html: _shell(`
      <p style="color:#374151;font-size:16px;margin:0 0 16px;">Olá, <strong>${primeiroNome}</strong>!</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
        ${titulo}. Depois disso a <strong>emissão de notas é pausada</strong>
        — suas notas já emitidas e seus cadastros continuam acessíveis,
        mas novas emissões só com a assinatura ativa.
      </p>
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${dados.checkoutUrl}" style="background:#1e40af;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;display:inline-block;">${cta}</a>
      </div>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
        Pagamento por Pix, cartão ou boleto. A ativação é automática —
        em minutos você volta a emitir.
      </p>`,
      'Lembrete automático da sua licença do NF-e Desktop.'),
  })
}
