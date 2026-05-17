// lib/hotmart.ts

const HOTMART_TOKEN = process.env.HOTMART_WEBHOOK_TOKEN!

// Eventos que indicam compra aprovada
const EVENTOS_COMPRA = [
  'PURCHASE_APPROVED',
  'PURCHASE_COMPLETE',
]

// Eventos de cancelamento/estorno — revogar a chave
const EVENTOS_CANCELAMENTO = [
  'PURCHASE_REFUNDED',
  'PURCHASE_CHARGEBACK',
  'PURCHASE_CANCELED',
]

export function validarTokenHotmart(token: string): boolean {
  if (!HOTMART_TOKEN) {
    console.error('HOTMART_WEBHOOK_TOKEN nao configurado')
    return false
  }
  return token === HOTMART_TOKEN
}

export function isCompraAprovada(evento: string): boolean {
  return EVENTOS_COMPRA.includes(evento)
}

export function isCancelamento(evento: string): boolean {
  return EVENTOS_CANCELAMENTO.includes(evento)
}

export function extrairDadosCompra(body: any): {
  email: string
  nome: string
  order_id: string
  produto: string
} | null {
  try {
    // Estrutura do webhook Hotmart
    const email    = body?.data?.buyer?.email
    const nome     = body?.data?.buyer?.name
    const order_id = body?.data?.purchase?.transaction
    const produto  = body?.data?.product?.name

    if (!email || !nome || !order_id) {
      console.error('Dados obrigatorios ausentes no webhook:', { email, nome, order_id })
      return null
    }

    return { email, nome, order_id, produto: produto || 'NF-e Desktop' }
  } catch (err) {
    console.error('Erro ao extrair dados do webhook Hotmart:', err)
    return null
  }
}
