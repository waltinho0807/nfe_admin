// ============================================================================
//  produto-fiscal.tsx — os campos do produto que decidem se a nota autoriza.
//
//  Cada regra aqui corresponde a uma rejeição que a gente tomou da SEFAZ em
//  homologação. A ideia é o formulário tornar o estado inválido inalcançável,
//  em vez de deixar a SEFAZ recusar depois — quando o cliente já apertou
//  "emitir" e não tem ideia do que "rejeição 932" significa.
// ============================================================================
import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Check, X, Loader2, AlertCircle, Search, ExternalLink } from "lucide-react";
import { useNcm, useNcmValido } from "@/hooks/use-lookup";
import { LabelAjuda } from "@/components/ajuda-fiscal";
// Valor vindo do banco pode estar com vírgula ("48,79"). parseFloat
// para na vírgula e mostraria 48,00 — número diferente do XML.
import { num } from "@shared/numeros";

/**
 * Atalhos de categoria. São TERMOS DE BUSCA, não códigos.
 *
 * Deliberado: uma lista de NCMs fixos no código viraria conselho fiscal meu, e
 * a Receita extingue códigos por ato que entra em vigor em dias — a SEFAZ passa
 * a rejeitar 778 imediatamente. Lista chumbada envelhece calada no cadastro do
 * cliente. Buscando na tabela ao vivo, o resultado é sempre o vigente.
 */
const ATALHOS_NCM = [
  "camiseta", "calcado", "caneca", "cosmetico",
  "cabo eletrico", "lampada", "brinquedo", "papelaria",
];

// ── CSOSN que envolvem substituição tributária ──────────────────────────
/** Emitente é o substituto: recolhe o ST e destaca na nota. */
/**
 * CST do ICMS — para emitente de regime normal (CRT 2 e 3).
 *
 * Lista curta de propósito. O manual tem mais códigos, mas os que sobram
 * são para casos raros (diferimento, zona franca) e cada opção a mais é
 * uma chance de escolher errado. Quem precisa de um deles tem contador.
 *
 * "Em branco" existe e é o padrão: sem CST, o sistema usa isento (40),
 * que é o comportamento seguro para quem não sabe responder.
 */
export const CST_ICMS = [
  { value: "", label: "Não sei — usar isento" },
  { value: "00", label: "00 - Tributada integralmente" },
  { value: "20", label: "20 - Com redução de base de cálculo" },
  { value: "40", label: "40 - Isenta" },
  { value: "41", label: "41 - Não tributada" },
  { value: "10", label: "10 - Tributada com substituição tributária" },
  { value: "60", label: "60 - ICMS cobrado antes por substituição" },
  { value: "90", label: "90 - Outros" },
];

export const CSOSN_SUBSTITUTO = ["201", "202", "203"];
/** ST já foi retido por outro antes: só informa os valores. */
export const CSOSN_ST_RETIDO = ["500"];

export function temSt(csosn?: string | null): boolean {
  const c = String(csosn || "");
  return CSOSN_SUBSTITUTO.includes(c) || CSOSN_ST_RETIDO.includes(c);
}

// A conversão é compartilhada — ver shared/numeros.ts.

/**
 * Valida o que a SEFAZ validaria. Devolve mensagens em linguagem de usuário,
 * citando a rejeição só entre parênteses — quem lê primeiro é o cliente, não
 * o desenvolvedor.
 */
export function validarFiscal(p: any): string[] {
  const erros: string[] = [];
  const csosn = String(p.csosn || "");
  const ncm = String(p.ncm || "").replace(/\D/g, "");

  if (ncm.length !== 8) {
    erros.push("O NCM precisa ter 8 dígitos. Códigos de 2, 4 ou 6 são capítulos e posições, e a SEFAZ recusa (rejeição 778).");
  }

  if (temSt(csosn)) {
    if (!String(p.cest || "").replace(/\D/g, "")) {
      erros.push("Produto com substituição tributária exige CEST (Convênio ICMS 92/2015).");
    }
  }

  if (CSOSN_SUBSTITUTO.includes(csosn)) {
    const modo = String(p.modBcSt || "");
    if (!modo) {
      erros.push("Escolha como a base de cálculo da ST é determinada.");
    }
    if (modo === "4" && num(p.pMvaSt) <= 0) {
      // Foi exatamente essa a rejeição 932 que a gente tomou.
      erros.push("Base da ST por Margem de Valor Agregado exige o percentual de MVA (rejeição 932).");
    }
    if (num(p.vIcmsSt) > 0 && num(p.vBcSt) <= 0) {
      erros.push("Há valor de ICMS-ST sem base de cálculo. Informe a base ou zere o ICMS-ST.");
    }
    if (csosn === "201" && num(p.aliqIcms) <= 0) {
      erros.push("CSOSN 201 dá direito a crédito, então precisa da alíquota de ICMS do Simples.");
    }
  }

  if (CSOSN_ST_RETIDO.includes(csosn)) {
    // No schema esses três são um grupo tudo-ou-nada. Faltar um dá 225.
    const trio = [num(p.vBcStRet), num(p.pSt), num(p.vIcmsStRet)];
    const preenchidos = trio.filter((v) => v > 0).length;
    if (preenchidos > 0 && preenchidos < 3) {
      erros.push("Base retida, alíquota e ICMS retido formam um conjunto: informe os três ou deixe os três em branco (rejeição 225).");
    }
  }

  return erros;
}

// ── Campo de NCM com busca ──────────────────────────────────────────────
interface CampoNcmProps {
  valor: string;
  onChange: (ncm: string) => void;
  onDescricaoSugerida?: (desc: string) => void;
}

export function CampoNcm({ valor, onChange, onDescricaoSugerida }: CampoNcmProps) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const { resultados, buscando, erroBusca } = useNcm(busca);
  const valido = useNcmValido(valor);
  const caixaRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora — sem isso a lista fica presa sobre o resto do form.
  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const digitos = valor.replace(/\D/g, "");

  return (
    <div className="space-y-2" ref={caixaRef}>
      <LabelAjuda campo="ncm" obrigatorio>NCM</LabelAjuda>
      <Popover open={aberto && (resultados.length > 0 || busca.length >= 2)} onOpenChange={setAberto}>
      <PopoverAnchor asChild>
      <div className="relative">
        <Input
          value={valor}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 8);
            onChange(v);
            setBusca(v);
            setAberto(v.length >= 2);
          }}
          onFocus={() => setAberto(true)}
          placeholder="8 dígitos"
          maxLength={8}
          className="pr-9 font-mono"
          data-testid="input-product-ncm"
        />
        <div className="absolute right-3 top-3">
          {digitos.length === 8 && valido === true && <Check className="h-4 w-4 text-emerald-600" />}
          {digitos.length === 8 && valido === false && <X className="h-4 w-4 text-destructive" />}
          {buscando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

      </div>
      </PopoverAnchor>

      {/* O painel vai em portal: dentro do container que rola ele era
          cortado na borda e não dava para descer a lista. */}
      <PopoverContent
        align="start"
        sideOffset={4}
        // Não rouba o foco: o usuário continua digitando no campo.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[--radix-popover-trigger-width] min-w-[22rem] p-0 max-h-80 overflow-auto"
      >
        {/* O painel é o lugar dos atalhos e dos links: espaço ali é de graça,
            e embaixo do campo eles empurravam o formulário inteiro pra baixo. */}
        <div>
            {erroBusca && (
              <div className="p-3 border-b bg-destructive/5">
                <p className="text-[13px] text-destructive">{erroBusca}</p>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  Você pode digitar o NCM à mão no campo acima.
                </p>
              </div>
            )}
            {resultados.length === 0 && !buscando && !erroBusca && (
              <div className="p-3 space-y-2">
                {busca.length >= 2 && (
                  <p className="text-xs text-muted-foreground">
                    Nada encontrado para "{busca}". Tente outra palavra.
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {ATALHOS_NCM.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setBusca(a)}
                      className="text-xs px-2 py-0.5 rounded-full border bg-muted/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid={`atalho-ncm-${a}`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground border-t pt-2">
                  Não achou?{" "}
                  <a
                    href="https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/classificacao-fiscal-de-mercadorias/ncm"
                    target="_blank" rel="noopener noreferrer"
                    className="underline inline-flex items-center gap-0.5 hover:text-foreground"
                    data-testid="link-ncm-receita"
                  >
                    Consulta da Receita <ExternalLink className="h-3 w-3" />
                  </a>
                  {" · "}
                  <a
                    href="https://portalunico.siscomex.gov.br/classif"
                    target="_blank" rel="noopener noreferrer"
                    className="underline inline-flex items-center gap-0.5 hover:text-foreground"
                    data-testid="link-ncm-siscomex"
                  >
                    Portal Siscomex <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
            )}
            {resultados.map((n) => (
              <button
                key={n.codigo}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-accent focus:bg-accent focus:outline-none border-b last:border-0"
                onClick={() => {
                  onChange(n.codigo);
                  setBusca("");
                  setAberto(false);
                  onDescricaoSugerida?.(n.descricao);
                }}
                data-testid={`ncm-sugestao-${n.codigo}`}
              >
                <span className="font-mono text-xs text-muted-foreground">{n.codigo}</span>
                <span className="block text-sm leading-snug">{n.descricao}</span>
              </button>
            ))}
        </div>
      </PopoverContent>
      </Popover>

      {digitos.length === 8 && valido === false
        ? <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Esse código não existe na tabela NCM. A SEFAZ recusaria a nota.
          </p>
        : <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Search className="h-3 w-3" /> Digite o código ou o nome do produto para buscar.
          </p>}

    </div>
  );
}

// ── Bloco de substituição tributária ────────────────────────────────────
//  Aparece só quando o CSOSN escolhido envolve ST. Oito campos sempre
//  visíveis assustariam quem vende camiseta e nunca viu ST na vida.
const modBcStOptions = [
  { value: "6", label: "6 - Valor da operação" },
  { value: "4", label: "4 - Margem de Valor Agregado (MVA)" },
  { value: "0", label: "0 - Preço tabelado ou máximo sugerido" },
  { value: "1", label: "1 - Lista negativa (valor)" },
  { value: "2", label: "2 - Lista positiva (valor)" },
  { value: "3", label: "3 - Lista neutra (valor)" },
  { value: "5", label: "5 - Pauta (valor)" },
];

interface BlocoStProps {
  form: any;
  setForm: (f: any) => void;
}

export function BlocoSt({ form, setForm }: BlocoStProps) {
  const csosn = String(form.csosn || "");
  if (!temSt(csosn)) return null;

  const campo = (k: string) => ({
    value: form[k] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [k]: e.target.value.replace(/[^\d.,]/g, "") }),
  });

  const substituto = CSOSN_SUBSTITUTO.includes(csosn);
  const modo = String(form.modBcSt || "");

  return (
    <div className="border-t pt-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Substituição tributária</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {substituto
            ? "Você recolhe o ICMS-ST e destaca na nota. O valor entra no total que o cliente paga."
            : "O ICMS-ST já foi retido antes por outro contribuinte. Aqui você só informa os valores, e eles não entram no total da nota."}
        </p>
      </div>

      <div className="space-y-2">
        <LabelAjuda campo="cest" obrigatorio>CEST</LabelAjuda>
        <Input
          value={form.cest ?? ""}
          onChange={(e) => setForm({ ...form, cest: e.target.value.replace(/\D/g, "").slice(0, 7) })}
          placeholder="7 dígitos"
          maxLength={7}
          className="font-mono"
          data-testid="input-product-cest"
        />
        <p className="text-xs text-muted-foreground">
          Obrigatório para produto sujeito a ST (Convênio ICMS 92/2015).
        </p>
      </div>

      {substituto ? (
        <>
          <div className="space-y-2">
            <LabelAjuda campo="modBcSt" obrigatorio>Base de cálculo da ST determinada por</LabelAjuda>
            <Select
              value={modo}
              onValueChange={(v) => setForm({ ...form, modBcSt: v })}
            >
              <SelectTrigger data-testid="select-product-modbcst">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {modBcStOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* pMVAST só existe no modo 4. Mostrar sempre confundiria; e o modo 4
              sem ele é rejeição 932 na cara do cliente. */}
          {modo === "4" && (
            <div className="space-y-2">
              <LabelAjuda campo="pMvaSt" obrigatorio>Percentual de MVA (%)</LabelAjuda>
              <Input {...campo("pMvaSt")} placeholder="30.00" data-testid="input-product-pmvast" />
              <p className="text-xs text-muted-foreground">
                Varia por NCM e por protocolo entre estados. Confira o convênio do seu produto.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Base de cálculo da ST (R$)</Label>
              <Input {...campo("vBcSt")} placeholder="0,00" data-testid="input-product-vbcst" />
            </div>
            <div className="space-y-2">
              <Label>Alíquota da ST (%)</Label>
              <Input {...campo("pIcmsSt")} placeholder="0,00" data-testid="input-product-picmsst" />
            </div>
            <div className="space-y-2">
              <Label>ICMS-ST (R$)</Label>
              <Input {...campo("vIcmsSt")} placeholder="0,00" data-testid="input-product-vicmsst" />
            </div>
          </div>

          {csosn === "201" && (
            <div className="space-y-2">
              <LabelAjuda campo="aliqIcms" obrigatorio>Alíquota de ICMS do Simples (%)</LabelAjuda>
              <Input
                value={form.aliqIcms ?? ""}
                onChange={(e) => setForm({ ...form, aliqIcms: e.target.value.replace(/[^\d.,]/g, "") })}
                placeholder="2.50"
                data-testid="input-product-aliqicms"
              />
              <p className="text-xs text-muted-foreground">
                O CSOSN 201 dá crédito ao comprador. Este percentual é o que aparece na nota como crédito.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <LabelAjuda campo="vBcStRet">Base retida antes (R$)</LabelAjuda>
              <Input {...campo("vBcStRet")} placeholder="0,00" data-testid="input-product-vbcstret" />
            </div>
            <div className="space-y-2">
              <LabelAjuda campo="pSt">Alíquota aplicada (%)</LabelAjuda>
              <Input {...campo("pSt")} placeholder="0,00" data-testid="input-product-pst" />
            </div>
            <div className="space-y-2">
              <LabelAjuda campo="vIcmsStRet">ICMS retido antes (R$)</LabelAjuda>
              <Input {...campo("vIcmsStRet")} placeholder="0,00" data-testid="input-product-vicmsstret" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Informe os três ou deixe os três em branco — a SEFAZ trata como um conjunto.
            Os valores vêm da nota do seu fornecedor.
          </p>
        </>
      )}
    </div>
  );
}
