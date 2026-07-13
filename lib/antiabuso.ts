// lib/antiabuso.ts
//
// Camada anti-abuso do trial — funções PURAS (testáveis sem banco).
//
// As três frentes:
//   1. normalizarEmail  — mata aliases (gmail ignora pontos e +sufixo:
//      walter+2@gmail.com === walter@gmail.com)
//   2. ehEmailDescartavel — bloqueia temp-mail comum (lista modesta de
//      propósito: para o abuso casual, não é corrida armamentista)
//   3. LIMITE_TRIALS_POR_IP_DIA — teto por IP/24h (generoso: CGNAT e
//      escritórios compartilham IP)
//
// A muralha PRINCIPAL (1 trial por MÁQUINA) fica no /activate — aqui
// só endurecemos a emissão da chave.

export const LIMITE_TRIALS_POR_IP_DIA = 3

/** Domínios que tratam +sufixo e (no caso do gmail) pontos como alias. */
const DOMINIOS_COM_ALIAS_DE_PONTO = new Set([
  'gmail.com', 'googlemail.com',
])

/**
 * Normaliza o e-mail pra comparação de unicidade:
 *   - trim + minúsculas
 *   - remove o sufixo +tag da parte local (padrão em todos os grandes)
 *   - gmail/googlemail: remove pontos da parte local e unifica domínio
 */
export function normalizarEmail(email: string): string {
  const e = (email || '').trim().toLowerCase()
  const arroba = e.lastIndexOf('@')
  if (arroba <= 0) return e
  let local = e.slice(0, arroba)
  let dominio = e.slice(arroba + 1)

  const mais = local.indexOf('+')
  if (mais > 0) local = local.slice(0, mais)

  if (dominio === 'googlemail.com') dominio = 'gmail.com'
  if (DOMINIOS_COM_ALIAS_DE_PONTO.has(dominio)) {
    local = local.replace(/\./g, '')
  }
  return `${local}@${dominio}`
}

/** Temp-mail mais comuns. Lista curta de propósito — cobre o casual. */
const DOMINIOS_DESCARTAVEIS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net',
  'sharklasers.com', '10minutemail.com', '10minutemail.net',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempail.com',
  'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'throwawaymail.com', 'trashmail.com', 'trashmail.de',
  'getnada.com', 'nada.email', 'dispostable.com',
  'maildrop.cc', 'mailnesia.com', 'mintemail.com',
  'mohmal.com', 'moakt.com', 'tmpmail.org', 'tmpmail.net',
  'fakeinbox.com', 'spamgourmet.com', 'mytemp.email',
  'burnermail.io', 'mailsac.com', 'inboxkitten.com',
  'emailondeck.com', '33mail.com', 'anonaddy.me',
  'discard.email', 'spambog.com', 'mail-temp.com',
  'tempinbox.com', 'luxusmail.org', 'mailbox.in.ua',
])

export function ehEmailDescartavel(email: string): boolean {
  const arroba = (email || '').lastIndexOf('@')
  if (arroba < 0) return false
  const dominio = email.slice(arroba + 1).trim().toLowerCase()
  return DOMINIOS_DESCARTAVEIS.has(dominio)
}
