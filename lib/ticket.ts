// lib/ticket.ts
import crypto from 'crypto'
import { Ticket } from './mongodb'

// Segue o mesmo padrão de lib/license.ts (gerarChaveUnica)
const PREFIXO = 'TKT'
const CHARS   = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem 0,1,I,O (confusos)

function gerarSegmento(tamanho = 6): string {
  let seg = ''
  const bytes = crypto.randomBytes(tamanho * 2)
  for (let i = 0; i < tamanho; i++) {
    seg += CHARS[bytes[i] % CHARS.length]
  }
  return seg
}

export function gerarTicketIdBruto(): string {
  // Ex: TKT-A3F9K2
  return `${PREFIXO}-${gerarSegmento()}`
}

export async function gerarTicketIdUnico(): Promise<string> {
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const id = gerarTicketIdBruto()
    const existe = await Ticket.findOne({ ticket_id: id })
    if (!existe) return id
  }
  throw new Error('Falha ao gerar ticket_id unico apos 10 tentativas')
}
