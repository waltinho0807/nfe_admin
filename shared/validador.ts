// ============================================================================
//  validador.ts — confere a nota ANTES de mandar para a SEFAZ.
//
//  O que checar aqui e o que não checar:
//
//  O schema XSD já pega estrutura — tag faltando, formato errado, tamanho de
//  campo. Repetir isso seria trabalho duplicado. O que o schema NÃO vê são as
//  regras de negócio: CPF com dígito errado, CFOP incompatível com o destino,
//  total que não fecha. É onde este validador atua.
//
//  Por que vale a pena: uma viagem à SEFAZ leva segundos e, quando falha,
//  volta com "Rejeição 244" — que o usuário não entende. Pegando aqui, o aviso
//  é imediato e aponta o campo.
// ============================================================================

// O validador precisa converter EXATAMENTE como o resto do sistema.
//
// Aqui havia um parseFloat próprio, e parseFloat para na vírgula:
// "5,50" virava 5. Como o formulário e o servidor já usavam a versão que
// entende vírgula, o total gravado ficava certo e a validação acusava
// divergência — barrando a emissão de notas que estavam corretas.
//
// O sintoma era cruel: item com valor "6,00" passava, porque truncar na
// vírgula dá o mesmo número. Só quebrava com centavos diferentes de zero.
import { num } from "./numeros";

export interface Achado {
  /** "erro" impede a emissão; "aviso" só alerta. */
  nivel: "erro" | "aviso";
  campo: string;
  mensagem: string;
  /** Rejeição que a SEFAZ devolveria — liga com o catálogo de erros. */
  rejeicao?: string;
}

const so = (v: unknown) => String(v ?? "").replace(/\D/g, "");


function cpfValido(cpf: string): boolean {
  const c = so(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += parseInt(c[i]) * (n + 1 - i);
    if (((soma * 10) % 11) % 10 !== parseInt(c[n])) return false;
  }
  return true;
}

function cnpjValido(cnpj: string): boolean {
  const c = so(cnpj);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const pesos = [[5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2]];
  for (let k = 0; k < 2; k++) {
    const n = 12 + k;
    let soma = 0;
    for (let i = 0; i < n; i++) soma += parseInt(c[i]) * pesos[k][i];
    const r = soma % 11;
    if ((r < 2 ? 0 : 11 - r) !== parseInt(c[n])) return false;
  }
  return true;
}

/** UF pelo primeiro dígito do CEP — pega o caso de UF trocada (rejeição 233). */
const FAIXAS_CEP: [number, number, string[]][] = [
  [1000000, 19999999, ["SP"]],
  [20000000, 28999999, ["RJ"]],
  [29000000, 29999999, ["ES"]],
  [30000000, 39999999, ["MG"]],
  [40000000, 48999999, ["BA"]],
  [49000000, 49999999, ["SE"]],
  [50000000, 56999999, ["PE"]],
  [57000000, 57999999, ["AL"]],
  [58000000, 58999999, ["PB"]],
  [59000000, 59999999, ["RN"]],
  [60000000, 63999999, ["CE"]],
  [64000000, 64999999, ["PI"]],
  [65000000, 65999999, ["MA"]],
  [66000000, 68899999, ["PA"]],
  [68900000, 68999999, ["AP"]],
  [69000000, 69299999, ["AM"]],
  [69300000, 69399999, ["RR"]],
  [69400000, 69899999, ["AM"]],
  [69900000, 69999999, ["AC"]],
  [70000000, 72799999, ["DF"]],
  [72800000, 72999999, ["GO"]],
  [73000000, 73699999, ["DF"]],
  [73700000, 76799999, ["GO"]],
  [76800000, 76999999, ["RO"]],
  [77000000, 77999999, ["TO"]],
  [78000000, 78899999, ["MT"]],
  [78900000, 78999999, ["RO"]],
  [79000000, 79999999, ["MS"]],
  [80000000, 87999999, ["PR"]],
  [88000000, 89999999, ["SC"]],
  [90000000, 99999999, ["RS"]],
];

export function ufDoCep(cep: string): string | null {
  const n = parseInt(so(cep), 10);
  if (!n) return null;
  const faixa = FAIXAS_CEP.find(([a, b]) => n >= a && n <= b);
  return faixa ? faixa[2][0] : null;
}

export interface DadosValidacao {
  emitente: {
    regimeTributario?: string | null;
    cnpj?: string | null;
    uf?: string | null;
    inscricaoEstadual?: string | null;
    codigoMunicipio?: string | null;
    razaoSocial?: string | null;
  };
  nota: {
    destNome?: string | null;
    destCpfCnpj?: string | null;
    destUf?: string | null;
    destCep?: string | null;
    destCodigoMunicipio?: string | null;
    destInscricaoEstadual?: string | null;
    tipoOperacao?: string | null;
    nfref?: string | null;
    totalNota?: string | number | null;
    valorFrete?: string | number | null;
    valorSeguro?: string | number | null;
    desconto?: string | number | null;
    outrasDespesas?: string | number | null;
    pagamentos?: { tPag: string; vPag: string | number }[] | null;
  };
  itens: {
    descricao?: string | null;
    ncm?: string | null;
    cfop?: string | null;
    quantidade?: string | number | null;
    valorUnitario?: string | number | null;
    valorTotal?: string | number | null;
    csosn?: string | null;
    /** Regime normal (CRT 2 e 3) usa CST no lugar de CSOSN. */
    cstIcms?: string | null;
    cstPis?: string | null;
    cstCofins?: string | null;
    modBcSt?: string | null;
    pMvaSt?: string | number | null;
    vBcSt?: string | number | null;
    vIcmsSt?: string | number | null;
    vBcStRet?: string | number | null;
    pSt?: string | number | null;
    vIcmsStRet?: string | number | null;
  }[];
}

export function validarAntesDeEmitir(d: DadosValidacao): Achado[] {
  const a: Achado[] = [];
  const { emitente: e, nota: n, itens } = d;

  // Serviço ainda não emite: o bloco ISSQN não existe.
  //
  // A operação está no menu e monta CFOP 5933 corretamente, mas o
  // <imposto> sai com ICMS — e a SEFAZ recusa, porque CFOP de serviço
  // exige ISSQN. Faltam o código da lista da LC 116, o município do fato
  // gerador e a alíquota, que nem existem no cadastro de produto.
  //
  // Bloquear é melhor que deixar tentar: operação que aparece no menu e
  // devolve rejeição é pior que operação que diz "ainda não".
  //
  // Fora do laço de itens de propósito — dentro, repetiria a mensagem
  // uma vez por produto.
  if (String((n as any).tipoOperacao ?? "").startsWith("servico")) {
    a.push({ nivel: "erro", campo: "Tipo de operação",
      mensagem: "Nota de serviço ainda não está disponível aqui. Serviço "
        + "normalmente é NFS-e, emitida pela prefeitura. Se você precisa de "
        + "NF-e com ISSQN, fale com o suporte." });
  }

  // ── Emitente ────────────────────────────────────────────────────────
  if (!cnpjValido(e.cnpj ?? "")) {
    a.push({ nivel: "erro", campo: "Emitente → CNPJ", rejeicao: "226",
      mensagem: "O CNPJ do emitente não é válido. Corrija em Emitente." });
  }
  if (!e.uf) {
    a.push({ nivel: "erro", campo: "Emitente → UF", mensagem: "Cadastre a UF do emitente." });
  }
  if (!so(e.codigoMunicipio)) {
    a.push({ nivel: "erro", campo: "Emitente → Código IBGE", rejeicao: "270",
      mensagem: "Falta o código IBGE do município do emitente. Digite o CEP em Emitente para preencher." });
  }

  // ── Destinatário ────────────────────────────────────────────────────
  if (!n.destNome?.trim()) {
    a.push({ nivel: "erro", campo: "Destinatário → Nome", mensagem: "Informe o nome do destinatário." });
  }

  const doc = so(n.destCpfCnpj);
  if (!doc) {
    a.push({ nivel: "erro", campo: "Destinatário → CPF/CNPJ", rejeicao: "243",
      mensagem: "Informe o CPF ou CNPJ do destinatário." });
  } else if (doc.length === 11 && !cpfValido(doc)) {
    a.push({ nivel: "erro", campo: "Destinatário → CPF", rejeicao: "244",
      mensagem: "O CPF informado não passa na verificação de dígitos. Confira com o cliente." });
  } else if (doc.length === 14 && !cnpjValido(doc)) {
    a.push({ nivel: "erro", campo: "Destinatário → CNPJ", rejeicao: "243",
      mensagem: "O CNPJ informado não passa na verificação de dígitos. Confira com o cliente." });
  } else if (doc.length !== 11 && doc.length !== 14) {
    a.push({ nivel: "erro", campo: "Destinatário → CPF/CNPJ", rejeicao: "243",
      mensagem: `Documento com ${doc.length} dígitos. CPF tem 11, CNPJ tem 14.` });
  }

  // UF x CEP: é a rejeição 233, e acontece quando o CEP preenche o endereço
  // e depois alguém troca a UF na mão.
  const ufCep = ufDoCep(n.destCep ?? "");
  if (ufCep && n.destUf && ufCep !== String(n.destUf).toUpperCase()) {
    a.push({ nivel: "erro", campo: "Destinatário → UF / CEP", rejeicao: "233",
      mensagem: `O CEP informado é de ${ufCep}, mas a UF está como ${n.destUf}. Confira qual está certo.` });
  }
  if (n.destCep && so(n.destCep).length !== 8) {
    a.push({ nivel: "erro", campo: "Destinatário → CEP", rejeicao: "234",
      mensagem: "O CEP precisa ter 8 dígitos." });
  }
  // Sem UF o sistema não sabe se a venda é interna ou interestadual: o
  // idDest sai 2 e o CFOP interno, e a SEFAZ devolve 732.
  if (!String(n.destUf ?? "").trim()) {
    a.push({ nivel: "erro", campo: "Destinatário → UF", rejeicao: "732",
      mensagem: "Informe a UF do destinatário. Digite o CEP para preencher automaticamente." });
  }

  if (!so(n.destCodigoMunicipio)) {
    a.push({ nivel: "aviso", campo: "Destinatário → Município", rejeicao: "270",
      mensagem: "Sem o código IBGE do município do destinatário a SEFAZ pode recusar. Digite o CEP para preencher." });
  }

  // ── Itens ───────────────────────────────────────────────────────────
  if (!itens.length) {
    a.push({ nivel: "erro", campo: "Itens", mensagem: "A nota precisa de ao menos um item." });
  }

  itens.forEach((it, i) => {
    const onde = `Item ${i + 1}${it.descricao ? ` (${it.descricao})` : ""}`;

    if (so(it.ncm).length !== 8) {
      a.push({ nivel: "erro", campo: `${onde} → NCM`, rejeicao: "562",
        mensagem: "O NCM precisa ter 8 dígitos. Códigos de 2, 4 ou 6 são capítulos, não produtos." });
    }
    if (so(it.cfop).length !== 4) {
      a.push({ nivel: "erro", campo: `${onde} → CFOP`, rejeicao: "374",
        mensagem: "CFOP inválido." });
    }
    if (num(it.quantidade) <= 0) {
      a.push({ nivel: "erro", campo: `${onde} → Quantidade`, mensagem: "A quantidade precisa ser maior que zero." });
    }
    if (num(it.valorTotal) <= 0) {
      a.push({ nivel: "erro", campo: `${onde} → Valor`, mensagem: "O valor do item precisa ser maior que zero." });
    }

    // Confere o produto da linha: quantidade × unitário = total. Diferença
    // acima de um centavo vira 610 na nota inteira.
    const esperado = num(it.quantidade) * num(it.valorUnitario);
    if (num(it.valorTotal) > 0 && Math.abs(esperado - num(it.valorTotal)) > 0.011) {
      a.push({ nivel: "erro", campo: `${onde} → Valor total`, rejeicao: "610",
        mensagem: `Quantidade × preço dá ${esperado.toFixed(2)}, mas o total está ${num(it.valorTotal).toFixed(2)}.` });
    }

    // PIS/COFINS destacados por quem está no Simples: a SEFAZ autoriza
    // (ela não conhece o regime de quem emite), mas o comprador recebe um
    // crédito que não existe. Aviso, não bloqueio — há caso legítimo.
    if (["1", "2"].includes(String(e.regimeTributario ?? "1"))) {
      for (const [campo, valor, nome] of [
        ["CST PIS", it.cstPis, "PIS"],
        ["CST COFINS", it.cstCofins, "COFINS"],
      ] as [string, string | null | undefined, string][]) {
        if (["01", "02"].includes(String(valor ?? ""))) {
          a.push({ nivel: "aviso", campo: `${onde} → ${campo}`,
            mensagem: `Este código destaca ${nome} na nota, mas empresa do Simples paga dentro do DAS. O normal é 49.` });
        }
      }
    }

  // Regime × código tributário — rejeição 591.
    //
    // CSOSN só vale para CRT 1 (Simples) e CRT 4 (MEI). O CRT 2 engana,
    // porque o nome tem "Simples" dentro, mas quem passou do sublimite
    // recolhe ICMS pelo regime normal e o documento usa CST.
    //
    // Aviso e não bloqueio: o builder converte o CSOSN para o CST
    // equivalente na hora de montar o XML, então a nota sai. Mas a
    // diferença tributária é real, e quem emite precisa saber que o
    // código do produto não corresponde ao regime da empresa.
    const crt = String(e.regimeTributario ?? "1").trim() || "1";
    if (!["1", "4"].includes(crt) && String(it.csosn ?? "").trim()
        && !String(it.cstIcms ?? "").trim()) {
      a.push({ nivel: "aviso", campo: `${onde} → CST`, rejeicao: "591",
        mensagem: `Este produto tem CSOSN, mas a empresa está no regime ${crt}, `
          + `que usa CST. Vamos converter para emitir, mas o certo é `
          + `cadastrar o CST no produto.` });
    }
    if (["1", "4"].includes(crt) && String(it.cstIcms ?? "").trim()
        && !String(it.csosn ?? "").trim()) {
      a.push({ nivel: "aviso", campo: `${onde} → CSOSN`, rejeicao: "590",
        mensagem: `Este produto tem CST, mas empresa do Simples usa CSOSN. `
          + `Cadastre o CSOSN no produto.` });
    }

    // ST — as regras que a gente descobriu na marra
    const csosn = String(it.csosn ?? "");
    if (["201", "202", "203"].includes(csosn)) {
      if (String(it.modBcSt ?? "") === "4" && num(it.pMvaSt) <= 0) {
        a.push({ nivel: "erro", campo: `${onde} → MVA`, rejeicao: "932",
          mensagem: "A base da ST está por Margem de Valor Agregado, mas o percentual não foi informado." });
      }
      if (num(it.vIcmsSt) > 0 && num(it.vBcSt) <= 0) {
        a.push({ nivel: "erro", campo: `${onde} → Base da ST`, rejeicao: "533",
          mensagem: "Há ICMS-ST sem base de cálculo. Informe a base ou zere o ICMS-ST." });
      }
    }
    if (csosn === "500") {
      const trio = [num(it.vBcStRet), num(it.pSt), num(it.vIcmsStRet)].filter((v) => v > 0).length;
      if (trio > 0 && trio < 3) {
        a.push({ nivel: "erro", campo: `${onde} → ST retido`, rejeicao: "225",
          mensagem: "Base retida, alíquota e ICMS retido formam um conjunto: informe os três ou deixe os três em branco." });
      }
    }
  });

  // ── Totais ──────────────────────────────────────────────────────────
  const vProd = itens.reduce((s, i) => s + num(i.valorTotal), 0);
  const vSt = itens.reduce(
    (s, i) => s + (["201", "202", "203"].includes(String(i.csosn ?? "")) ? num(i.vIcmsSt) : 0), 0);
  const esperadoNF = vProd - num(n.desconto) + vSt
    + num(n.valorFrete) + num(n.valorSeguro) + num(n.outrasDespesas);

  if (num(n.totalNota) > 0 && Math.abs(esperadoNF - num(n.totalNota)) > 0.011) {
    a.push({ nivel: "aviso", campo: "Valores → Total", rejeicao: "610",
      mensagem: `Pela soma dos itens o total seria ${esperadoNF.toFixed(2)}. O sistema recalcula na emissão.` });
  }

  if (n.pagamentos?.length) {
    const soma = n.pagamentos.reduce((s, p) => s + num(p.vPag), 0);
    const alvo = esperadoNF || num(n.totalNota);
    if (alvo > 0 && Math.abs(soma - alvo) > 0.011) {
      a.push({ nivel: "erro", campo: "Pagamento", rejeicao: "528",
        mensagem: `As formas de pagamento somam ${soma.toFixed(2)} e a nota é ${alvo.toFixed(2)}.` });
    }
  }

  // ── Devolução ───────────────────────────────────────────────────────
  const devolucao = String(n.tipoOperacao ?? "").includes("devolucao");
  if (devolucao && so(n.nfref).length !== 44) {
    a.push({ nivel: "erro", campo: "Operação → Chave da nota original", rejeicao: "321",
      mensagem: "Devolução exige a chave da nota original, com 44 dígitos." });
  }

  return a;
}

export function temBloqueio(achados: Achado[]): boolean {
  return achados.some((x) => x.nivel === "erro");
}
