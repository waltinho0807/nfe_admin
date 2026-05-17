// app/api/webhook/hotmart/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { connectDB, License, Event } from '@/lib/mongodb'
import { gerarChaveUnica } from '@/lib/license'
import { enviarEmailAtivacao } from '@/lib/email'
import {
  validarTokenHotmart,
  isCompraAprovada,
  isCancelamento,
  extrairDadosCompra,
} from '@/lib/hotmart'

export async function POST(req: NextRequest) {
  try {
    await connectDB()

    const body  = await req.json()
    const evento = body?.event as string

    // 1. Valida token do Hotmart
    // O token vem no body ou no header dependendo da versao do Hotmart
    const token = body?.hottok || req.headers.get('x-hotmart-webhook-token') || ''
    if (!validarTokenHotmart(token)) {
      console.warn('Webhook com token invalido:', token?.slice(0, 8))
      // Retorna 200 mesmo com token invalido para nao gerar retry loop
      return NextResponse.json({ received: true })
    }

    console.log(`Webhook Hotmart recebido: ${evento}`)

    // 2. Compra aprovada → gera chave e envia email
    if (isCompraAprovada(evento)) {
      const dados = extrairDadosCompra(body)
      if (!dados) {
        await Event.create({
          tipo: 'erro',
          chave: null,
          dados: { evento, body, motivo: 'Dados invalidos no payload' },
        })
        return NextResponse.json({ received: true })
      }

      const { email, nome, order_id, produto } = dados

      // Verifica se ja processamos esta compra (idempotencia)
      const existente = await License.findOne({ order_id })
      if (existente) {
        console.log(`Order ${order_id} ja processada, ignorando`)
        return NextResponse.json({ received: true })
      }

      // Gera chave unica
      const chave = await gerarChaveUnica()

      // Salva no banco
      await License.create({
        chave,
        email,
        nome,
        order_id,
        status:        'inativa',
        machine_id:    null,
        data_compra:   new Date(),
        data_ativacao: null,
        ultimo_acesso: null,
      })

      // Registra evento
      await Event.create({
        tipo:  'compra',
        chave,
        dados: { email, nome, order_id, produto, evento },
        ip:    req.headers.get('x-forwarded-for') || 'webhook',
      })

      // Envia email com a chave
      try {
        await enviarEmailAtivacao(email, nome, chave)
        console.log(`Email enviado para ${email} — chave ${chave}`)
      } catch (emailErr) {
        // Email falhou mas a chave foi salva — nao bloqueia
        console.error('Falha ao enviar email:', emailErr)
        await Event.create({
          tipo:  'erro',
          chave,
          dados: { motivo: 'Falha ao enviar email', error: String(emailErr) },
        })
      }

      return NextResponse.json({
        received: true,
        message:  `Chave gerada e email enviado para ${email}`,
      })
    }

    // 3. Cancelamento/estorno → revoga a chave
    if (isCancelamento(evento)) {
      const dados = extrairDadosCompra(body)
      if (dados) {
        const license = await License.findOne({ order_id: dados.order_id })
        if (license && license.status !== 'revogada') {
          await License.updateOne(
            { order_id: dados.order_id },
            { status: 'revogada', updated_at: new Date() }
          )
          await Event.create({
            tipo:  'revogacao',
            chave: license.chave,
            dados: { motivo: `Evento Hotmart: ${evento}`, order_id: dados.order_id },
          })
          console.log(`Chave ${license.chave} revogada — ${evento}`)
        }
      }
      return NextResponse.json({ received: true })
    }

    // 4. Outros eventos — so loga
    console.log(`Evento ignorado: ${evento}`)
    return NextResponse.json({ received: true })

  } catch (err) {
    console.error('Erro no webhook Hotmart:', err)
    // Retorna 200 para evitar retry infinito do Hotmart
    return NextResponse.json({ received: true, error: true })
  }
}
