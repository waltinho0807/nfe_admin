// types/index.ts

export interface ILicense {
  _id?: string
  chave: string              // ERPA-XXXX-XXXX-XXXX
  email: string
  nome: string
  order_id: string           // ID da compra no Hotmart
  status: 'inativa' | 'ativa' | 'revogada' | 'suspensa'
  machine_id: string | null  // null até primeiro acesso
  data_compra: Date
  data_ativacao: Date | null
  ultimo_acesso: Date | null
  created_at: Date
  updated_at: Date
}

export interface IActivation {
  _id?: string
  chave: string
  machine_id: string
  ip: string
  user_agent: string
  data: Date
}

export interface IEvent {
  _id?: string
  tipo: 'compra' | 'ativacao' | 'validacao' | 'revogacao' | 'reset_senha' | 'erro'
  chave: string
  dados: Record<string, unknown>
  ip?: string
  data: Date
}

export interface HotmartWebhookPayload {
  data: {
    buyer: {
      email: string
      name: string
    }
    purchase: {
      order_date: string
      status: string
      transaction: string
    }
    product: {
      id: number
      name: string
    }
  }
  event: string
  hottok: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message: string
  data?: T
}
