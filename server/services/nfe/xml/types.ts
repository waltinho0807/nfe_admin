// Tipos que o builder v2 lê. camelCase pra casar com o schema do app TS.
// Superset do schema.ts atual + campos novos que o v2 usa (tipoOperacao,
// nfref, pagamentos, etc). Nada aqui depende de Drizzle/Mongo — são só shapes.

export interface EmitterV2 {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  inscricaoEstadual?: string | null;
  regimeTributario?: string | null;   // CRT: "1"/"2"=Simples, "3"=Lucro
  cep: string;
  uf: string;
  municipio: string;
  bairro: string;
  logradouro: string;
  numero: string;
  complemento?: string | null;
  telefone?: string | null;
  codigoMunicipio?: string | null;     // IBGE 7 dígitos
}

export interface PagamentoV2 {
  tPag: string;                 // 01=dinheiro 03=cartão crédito 04=débito 15=boleto 17=PIX ...
  vPag: string | number;
  indPag?: string;              // 0=à vista 1=a prazo
  tpIntegra?: string;           // cartão: 1=integrado 2=não integrado
  CNPJ?: string; tBand?: string; cAut?: string;
}

export interface InvoiceV2 {
  serie?: string;
  numero?: string;
  naturezaOperacao?: string;
  finalidade?: string;
  indicadorPresenca?: string;
  indicadorIntermediador?: string;     // regra 434 (marketplace) quando indPres=9
  consumidorFinal?: boolean | null;
  dataEmissao: string;
  horaEmissao: string;
  dataSaida?: string | null;
  horaSaida?: string | null;

  destNome: string;
  destCpfCnpj: string;
  destInscricaoEstadual?: string | null;
  destCep?: string | null;
  destUf?: string | null;
  destMunicipio?: string | null;
  destCodigoMunicipio?: string | null;
  destBairro?: string | null;
  destLogradouro?: string | null;
  destNumero?: string | null;
  destComplemento?: string | null;
  destTelefone?: string | null;
  destEmail?: string | null;

  totalProdutos?: string | number;
  valorFrete?: string | number;
  valorSeguro?: string | number;
  outrasDespesas?: string | number;
  desconto?: string | number;
  totalNota?: string | number;
  modalidadeFrete?: string;
  /** Descrição do volume: caixa, pacote, fardo. */
  especieVolume?: string;
  informacoesComplementares?: string | null;

  // Campos v2
  tipoOperacao?: string;               // "venda" | "bonificacao" | "devolucao_venda" | ...
  nfref?: string;                      // chave de 44 dígitos p/ devolução/complementar
  formaPagamento?: string;             // modo legado (pagamento único)
  pagamentos?: PagamentoV2[];          // modo novo (múltiplos)
}

export interface InvoiceItemV2 {
  codigo: string;
  descricao: string;
  ncm: string;
  cfop?: string;
  /** CFOP do item quando o destino é outro estado. */
  cfopInterestadual?: string;
  /** CFOP por operação, quando o produto foge do padrão em mais de uma. */
  cfops?: { operacao: string; interno: string; externo: string }[];                       // se vazio, deriva da operação
  unidade: string;
  quantidade: string | number;
  valorUnitario: string | number;
  valorTotal: string | number;
  ean?: string | null;
  origem?: string;
  // Simples
  csosn?: string;
  /** Peso da embalagem, em kg — vai para o bloco de volumes. */
  pesoBruto?: string;
  pesoLiquido?: string;
  // Lucro
  cstIcms?: string;
  aliqIcms?: string | number;
  // Substituição tributária — CSOSN 201/202/203 (emitente é o substituto)
  vBcSt?: string | number;
  pIcmsSt?: string | number;
  vIcmsSt?: string | number;
  // ST já retido anteriormente — CSOSN 500 (grupo tudo-ou-nada no schema)
  vBcStRet?: string | number;
  pSt?: string | number;
  vIcmsStRet?: string | number;
  // Modalidade da BC da ST. 4=MVA (exige pMvaSt), 6=valor da operação (default)
  modBcSt?: string;

  // ── Regime normal (CRT 2 e 3), onde o ICMS vai por CST ──────────────
  /** Modalidade da base do ICMS próprio. 3 = valor da operação (padrão). */
  modBc?: string;
  /** Percentual de redução da base, usado no CST 20. */
  pRedBc?: string | number;
  pMvaSt?: string | number;
  /** Tributo aproximado do item (Lei 12.741). Calculado pelo serviço IBPT. */
  vTotTrib?: string | number;
  // Devolução — <DFeReferenciado> por item (PL_010 / rejeição 321)
  refChaveAcesso?: string;   // chave do documento original (default: invoice.nfref)
  refNItem?: string | number; // nItem no documento ORIGINAL (default: mesma posição)
  // PIS/COFINS
  cstPis?: string;
  cstCofins?: string;
  aliqPis?: string | number;
  aliqCofins?: string | number;
  // Rateio (preenchido pelo orquestrador)
  rateioFrete?: string; rateioSeguro?: string; rateioDesconto?: string; rateioOutras?: string;
}

/** Estratégia de imposto: recebe o item e o emitente, devolve o XML de <imposto>. */
export type TaxStrategy = (item: InvoiceItemV2, emitter: EmitterV2) => string;
