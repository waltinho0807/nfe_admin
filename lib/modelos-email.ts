// ============================================================================
//  lib/modelos-email.ts — os quatro textos de captação.
//
//  TEXTO SIMPLES, de propósito. Template com logo, botão e colunas grita
//  disparo em massa, e é justamente o que o criador ignora — além de
//  passar pior no filtro de spam. E-mail que parece escrito por uma pessoa
//  é lido por uma pessoa.
//
//  O HTML bonito fica para quem já respondeu.
//
//  As variáveis entre chaves são trocadas na hora do envio. {referencia}
//  é o vídeo ou assunto citado — é ela que separa isto de um disparo, e
//  por isso o envio recusa quando ela fica vazia num modelo que a usa.
// ============================================================================

export interface ModeloEmail {
  id: string
  nome: string
  descricao: string
  assunto: string
  corpo: string
  /** Variáveis obrigatórias: sem elas o envio é recusado. */
  exige: string[]
}

export const MODELOS: ModeloEmail[] = [
  {
    id: 'publico-ganha',
    nome: 'Influenciador — o que o público dele ganha',
    descricao:
      'Para canais de 30 a 100 mil, onde a comissão importa de verdade. '
      + 'Lidera pelo desconto que ele oferece à audiência, não pela comissão.',
    assunto: 'Seu público paga R$ 1,99 no primeiro mês — emissor de NF-e',
    exige: ['nome', 'referencia'],
    corpo: `Oi, {nome}, tudo bem?

Sou Walter, desenvolvedor do Calegari NF-e. Vi seu vídeo sobre {referencia} e escrevo porque tenho uma coisa que talvez interesse ao seu público mais do que a você.

Meu sistema emite NF-e por R$ 9,90 por mês, sem taxa por nota. E quem entrar pelo seu link paga R$ 1,99 no primeiro mês.

Ou seja: você não precisa vender nada. Você tá dando um desconto pra quem te assiste.

Do seu lado, se quiser: R$ 10 por pessoa que assinar pelo seu link e pagar, mais R$ 5 se a conta continuar ativa aos 90 dias. Pix, sem valor mínimo pra sacar, com painel onde você vê cliques, cadastros e quanto tem a receber.

Sem contrato, sem exclusividade, sem obrigação de postar. E acesso completo ao sistema de graça, pra você usar e mostrar do jeito que achar melhor — ou concluir que não presta e não falar nada.

Se quiser dar uma olhada antes de responder: {site}

Walter Calegari
Calegari Sistemas`,
  },

  {
    id: 'testa-critica',
    nome: 'Influenciador — pedir crítica, não publi',
    descricao:
      'Para canais grandes, acima de 200 mil. Eles recebem proposta comercial '
      + 'toda semana e ignoram; ninguém pede a opinião técnica deles.',
    assunto: 'Queria que você testasse (e criticasse) meu emissor de NF-e',
    exige: ['nome', 'referencia'],
    corpo: `Oi, {nome}, tudo bem?

Sou Walter, de Mineiros (GO). Trabalho como eletricista de automação agrícola e desenvolvo software fiscal — o Calegari NF-e nasceu assim, sozinho.

Vi seu vídeo sobre {referencia}. Não vim vender publi: vim pedir que você quebre o meu sistema.

Você conhece a parte fiscal melhor do que eu conheço a minha própria tela. Passei meses depurando rejeição de verdade contra a SEFAZ — 539, 732, 629, 328, 321 — e implementando o CRT 4 do MEI, que muitos sistemas simplesmente não têm. Mas só vejo o que eu mesmo testo.

Queria te dar acesso completo, sem cobrar nada e sem compromisso nenhum de publicação, pra você emitir de verdade e me dizer onde tá ruim. Se achar que não presta, quero saber — me serve mais que um vídeo elogiando.

Se depois você achar que serve pro seu pessoal, aí sim conversamos: tenho comissão por indicação em Pix, e quem entra pelo seu link paga R$ 1,99 no primeiro mês.

Dá pra ver o sistema funcionando sem criar conta aqui: {site}/demonstracao

Walter Calegari
Calegari Sistemas`,
  },

  {
    id: 'contador',
    nome: 'Contador — painel e XMLs',
    descricao:
      'Para escritórios de contabilidade. O argumento não é comissão: é '
      + 'parar de correr atrás de XML todo mês.',
    assunto: 'Os XMLs dos seus clientes num arquivo só, por competência',
    exige: ['nome'],
    corpo: `Oi, {nome}, tudo bem?

Sou Walter, desenvolvedor do Calegari NF-e, um emissor de nota fiscal para MEI e pequenas empresas.

Escrevo porque tenho uma coisa feita para o seu lado da mesa, não para o do cliente.

Quando um cliente seu usa o sistema e te autoriza, você baixa de uma vez, por competência: os XMLs de saída, os de entrada que ele recebeu de fornecedores, os eventos de cancelamento e carta de correção, uma planilha de conferência, e um relatório com os buracos de numeração — aqueles números que ninguém usou e ninguém inutilizou, e que aparecem no fechamento.

O painel é gratuito, com um cliente ou com cem. Com 3 clientes ativos, o seu escritório também emite sem pagar mensalidade.

O acesso é sempre somente leitura, e é o cliente quem autoriza — você não consegue emitir nem cancelar nada no nome dele.

Se quiser experimentar: {site}

Walter Calegari
Calegari Sistemas`,
  },

  {
    id: 'segunda-tentativa',
    nome: 'Segunda tentativa',
    descricao:
      'Para quem não respondeu, 10 a 14 dias depois. A maior parte da '
      + 'resposta em contato frio vem no segundo toque.',
    assunto: 'Re: emissor de NF-e — uma linha só',
    exige: ['nome'],
    corpo: `Oi, {nome},

Escrevi há algumas semanas sobre o Calegari NF-e e imagino que tenha se perdido na caixa — sei como é.

Resumo em três linhas:

Emissor de NF-e por R$ 9,90/mês. Quem entra pelo seu link paga R$ 1,99 no primeiro mês. Você recebe R$ 10 por assinante, em Pix, sem valor mínimo pra sacar.

Acesso completo liberado na hora, sem compromisso de postar nada.

Se não for pra você, me responde só "não" que eu paro de escrever — sem ressentimento.

Walter Calegari
Calegari Sistemas`,
  },
]

export function acharModelo(id: string): ModeloEmail | undefined {
  return MODELOS.find((m) => m.id === id)
}

/**
 * Troca as variáveis e devolve o que ficou faltando.
 *
 * Devolver as pendências em vez de deixar {referencia} aparecer no e-mail
 * é o ponto: um "Vi seu vídeo sobre {referencia}" enviado assim destrói o
 * contato de forma irrecuperável.
 */
export function preencher(
  modelo: ModeloEmail,
  vars: Record<string, string | undefined>,
): { assunto: string; corpo: string; faltando: string[] } {
  const faltando = modelo.exige.filter((v) => !String(vars[v] ?? '').trim())

  const trocar = (t: string) =>
    t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '').trim() || `{${k}}`)

  return {
    assunto: trocar(modelo.assunto),
    corpo: trocar(modelo.corpo),
    faltando,
  }
}
