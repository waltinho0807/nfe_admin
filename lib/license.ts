// lib/license.ts
import crypto from 'crypto'
import { License } from './mongodb'

const PREFIXO = 'ERPA'
const CHARS   = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem 0,1,I,O (confusos)

function gerarSegmento(tamanho = 4): string {
  let seg = ''
  const bytes = crypto.randomBytes(tamanho * 2)
  for (let i = 0; i < tamanho; i++) {
    seg += CHARS[bytes[i] % CHARS.length]
  }
  return seg
}

export function gerarChaveBruta(): string {
  return `${PREFIXO}-${gerarSegmento()}-${gerarSegmento()}-${gerarSegmento()}`
}

export async function gerarChaveUnica(): Promise<string> {
  // Garante unicidade — gera ate encontrar uma chave nova
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const chave = gerarChaveBruta()
    const existe = await License.findOne({ chave })
    if (!existe) return chave
  }
  throw new Error('Falha ao gerar chave unica apos 10 tentativas')
}

export function validarFormatoChave(chave: string): boolean {
  return /^ERPA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(chave)
}
