// ============================================================================
//  tax/regime-normal.ts — ICMS por CST, para CRT 2 e 3.
//
//  Existe por causa da rejeição 591: "CSOSN informado para emissor que não
//  é do Simples Nacional". A SEFAZ só aceita CSOSN de CRT 1 e CRT 4.
//
//  Repare que CRT 2 usa CST, e não CSOSN. É contraintuitivo — o nome do
//  regime é "Simples Nacional, excesso de sublimite de receita bruta" —,
//  mas quem passou do sublimite recolhe ICMS pelo regime normal, e o
//  documento tem que refletir isso. O seletor antigo mandava CRT 2 para o
//  builder do Simples, e toda nota desse emitente era recusada.
//
//  CRT 3 é Lucro Presumido ou Real, e sempre foi CST.
// ============================================================================

import { tag, wrap, dec2, num } from "../helpers";
import type { InvoiceItemV2, EmitterV2 } from "../types";
import { num as numBr } from "@shared/numeros";

/**
 * Converte um CSOSN para o CST de sentido equivalente.
 *
 * Serve para o produto cadastrado antes de o regime mudar — situação
 * comum, porque a empresa estoura o sublimite no meio do ano e os
 * produtos continuam com o código antigo.
 *
 * Converter em vez de recusar é a mesma decisão que já foi tomada para o
 * MEI: travar a emissão por um código que dá para deduzir seria pior que
 * ajustar. Mas aqui a conversão é anotada, porque a diferença tributária
 * é real e o contador precisa saber.
 */
export function cstEquivalenteAoCsosn(csosn?: string | null): string {
  const c = String(csosn ?? "").trim();
  // 101/102/103/300/400: sem ICMS a destacar no Simples → isento/não
  // tributada no regime normal.
  if (["102", "103", "300", "400"].includes(c)) return "40";
  if (c === "101") return "20";                    // com permissão de crédito
  if (["201", "202", "203"].includes(c)) return "10";  // com ST
  if (c === "500") return "60";                    // ST já recolhida
  if (c === "900") return "90";                    // outros
  return "00";                                     // tributada integralmente
}

export function buildImposto(item: InvoiceItemV2, _emitter: EmitterV2): string {
  const orig = String(item.origem || "0");

  // O CST do item manda. Só quando ele não existe é que o CSOSN é
  // convertido — e nunca o contrário: sobrescrever um CST que o usuário
  // escolheu seria pior que qualquer rejeição.
  const cst = String(item.cstIcms || "").trim()
    || cstEquivalenteAoCsosn(item.csosn);

  const vProd = numBr(item.valorTotal);
  const aliq = numBr(item.aliqIcms);
  const modBC = String(item.modBc ?? "3");   // 3 = valor da operação

  let icmsInner: string;

  if (["00"].includes(cst)) {
    // Tributada integralmente.
    const vBC = vProd;
    const vIcms = Math.round(vBC * aliq) / 100;
    icmsInner = wrap("ICMS00",
      tag("orig", orig) + tag("CST", "00") +
      tag("modBC", modBC) + tag("vBC", dec2(vBC)) +
      tag("pICMS", aliq.toFixed(2)) + tag("vICMS", vIcms.toFixed(2)));

  } else if (cst === "20") {
    // Com redução de base de cálculo.
    const pRed = numBr(item.pRedBc);
    const vBC = Math.round(vProd * (100 - pRed)) / 100;
    const vIcms = Math.round(vBC * aliq) / 100;
    icmsInner = wrap("ICMS20",
      tag("orig", orig) + tag("CST", "20") +
      tag("modBC", modBC) + tag("pRedBC", pRed.toFixed(2)) +
      tag("vBC", dec2(vBC)) + tag("pICMS", aliq.toFixed(2)) +
      tag("vICMS", vIcms.toFixed(2)));

  } else if (["40", "41", "50"].includes(cst)) {
    // Isenta, não tributada ou suspensão: só orig e CST.
    icmsInner = wrap("ICMS40", tag("orig", orig) + tag("CST", cst));

  } else if (cst === "10") {
    // Tributada com substituição tributária.
    const vBC = vProd;
    const vIcms = Math.round(vBC * aliq) / 100;
    const modST = String(item.modBcSt ?? "4");
    let st = tag("orig", orig) + tag("CST", "10") +
      tag("modBC", modBC) + tag("vBC", dec2(vBC)) +
      tag("pICMS", aliq.toFixed(2)) + tag("vICMS", vIcms.toFixed(2)) +
      tag("modBCST", modST);
    if (modST === "4") st += tag("pMVAST", num(item.pMvaSt).toFixed(2));
    st += tag("vBCST", dec2(item.vBcSt ?? 0)) +
      tag("pICMSST", num(item.pIcmsSt).toFixed(2)) +
      tag("vICMSST", dec2(item.vIcmsSt ?? 0));
    icmsInner = wrap("ICMS10", st);

  } else if (cst === "60") {
    // ST já recolhida anteriormente.
    let inner = tag("orig", orig) + tag("CST", "60");
    const vBcStRet = num(item.vBcStRet);
    if (vBcStRet > 0) {
      inner += tag("vBCSTRet", vBcStRet.toFixed(2)) +
        tag("pST", num(item.pSt).toFixed(2)) +
        tag("vICMSSTRet", num(item.vIcmsStRet).toFixed(2));
    }
    icmsInner = wrap("ICMS60", inner);

  } else {
    // 90 e o que não se encaixou: outros.
    const vBC = aliq > 0 ? vProd : 0;
    const vIcms = Math.round(vBC * aliq) / 100;
    let inner = tag("orig", orig) + tag("CST", "90");
    if (vBC > 0) {
      inner += tag("modBC", modBC) + tag("vBC", dec2(vBC)) +
        tag("pICMS", aliq.toFixed(2)) + tag("vICMS", vIcms.toFixed(2));
    }
    icmsInner = wrap("ICMS90", inner);
  }

  const icms = wrap("ICMS", icmsInner);

  // ── PIS ──────────────────────────────────────────────────────────────
  // Fora do Simples, o padrão é tributado: 01 com alíquota. O 49 do
  // Simples, se vier, é mantido — quem escolheu sabe por quê.
  const cstPis = String(item.cstPis || "01");
  const aliqPis = item.aliqPis === undefined || item.aliqPis === null || item.aliqPis === ""
    ? 1.65 : numBr(item.aliqPis);
  const vPis = Math.round(vProd * aliqPis) / 100;
  const pisInner = ["01", "02"].includes(cstPis)
    ? wrap("PISAliq",
        tag("CST", cstPis) + tag("vBC", dec2(vProd)) +
        tag("pPIS", aliqPis.toFixed(2)) + tag("vPIS", vPis.toFixed(2)))
    : wrap("PISOutr",
        tag("CST", cstPis) + tag("vBC", "0.00") +
        tag("pPIS", "0.00") + tag("vPIS", "0.00"));

  // ── COFINS ───────────────────────────────────────────────────────────
  const cstCof = String(item.cstCofins || "01");
  const aliqCof = item.aliqCofins === undefined || item.aliqCofins === null || item.aliqCofins === ""
    ? 7.60 : numBr(item.aliqCofins);
  const vCof = Math.round(vProd * aliqCof) / 100;
  const cofInner = ["01", "02"].includes(cstCof)
    ? wrap("COFINSAliq",
        tag("CST", cstCof) + tag("vBC", dec2(vProd)) +
        tag("pCOFINS", aliqCof.toFixed(2)) + tag("vCOFINS", vCof.toFixed(2)))
    : wrap("COFINSOutr",
        tag("CST", cstCof) + tag("vBC", "0.00") +
        tag("pCOFINS", "0.00") + tag("vCOFINS", "0.00"));

  return wrap("imposto", icms + wrap("PIS", pisInner) + wrap("COFINS", cofInner));
}
