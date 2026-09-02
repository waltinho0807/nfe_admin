// ============================================================================
//  Seletor de estratégia de imposto por regime do emitente.
//
//  A regra vem da rejeição 591: CSOSN só vale para CRT 1 e CRT 4. Qualquer
//  outro regime exige CST.
//
//  CRT 1 — Simples Nacional ................ CSOSN
//  CRT 2 — Simples, excesso de sublimite ... CST   ← contraintuitivo
//  CRT 3 — Lucro Presumido ou Real ......... CST
//  CRT 4 — MEI ............................. CSOSN
//
//  O CRT 2 é o que engana: o nome tem "Simples" dentro, mas quem passou do
//  sublimite recolhe ICMS pelo regime normal. O seletor anterior mandava
//  tudo para o builder do Simples, com um TODO dizendo que o Lucro
//  Presumido não tinha sido portado — e toda nota de CRT 2 ou 3 era
//  recusada com a 591.
// ============================================================================

import type { TaxStrategy } from "../types";
import { buildImposto as buildImpostoSimples } from "./simples-nacional";
import { buildImposto as buildImpostoNormal } from "./regime-normal";

/** CRTs que a SEFAZ aceita com CSOSN. */
const COM_CSOSN = new Set(["1", "4"]);

export function getTaxStrategy(regimeTributario?: string | null): TaxStrategy {
  const crt = String(regimeTributario ?? "1").trim() || "1";
  return COM_CSOSN.has(crt) ? buildImpostoSimples : buildImpostoNormal;
}
