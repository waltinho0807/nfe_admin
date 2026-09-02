// ============================================================================
//  produto-form.tsx — corpo do cadastro de produto/serviço.
//
//  Escala tipográfica e estrutura portadas do diálogo do desktop. Duas coisas
//  que estavam erradas na versão anterior e foram consertadas aqui:
//
//  1. O formulário mudava de formato. Ao trocar para Serviço, o NCM, o código
//     de barras, a origem e as variações sumiam e o diálogo encolhia de
//     repente. Agora a grade é estável: os campos que não se aplicam ficam
//     desabilitados com a explicação, em vez de desaparecerem.
//  2. Texto pequeno demais. O input passou de 14px para 16px — quase o mesmo
//     que os 13pt (~17px) do desktop, e o limite abaixo do qual o Safari do
//     iOS dá zoom ao focar o campo.
// ============================================================================
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Receipt, Info, Package, ChevronDown } from "lucide-react";
import { pesoParaCobranca, formatarPeso } from "@/lib/frete";
import { num } from "@shared/numeros";
import { CampoTexto, CampoSelect, Rotulo, CabecalhoSecao, ESCALA } from "@/components/campo";
import { CampoNcm, BlocoSt, temSt, CST_ICMS } from "@/components/produto-fiscal";
import { CampoCfop, type CfopOperacao } from "@/components/campo-cfop";
import { BlocoVariacoes } from "@/components/produto-variacoes";
import {
  cfopPorTipo, cfopPadrao, csosnPorTipo, unidadePorTipo, unidadePadrao,
  ORIGEM_OPCOES, type TipoItem,
} from "@/lib/opcoes-fiscais";
import { useQuery } from "@tanstack/react-query";
import type { InsertProduct, Variacao, Emitter } from "@shared/schema";

interface Props {
  form: Partial<InsertProduct>;
  setForm: (f: any) => void;
  editando: boolean;
}

/**
 * Avisa quando o CST escolhido destaca o tributo na nota mas o emitente
 * é do Simples Nacional — que paga PIS e COFINS dentro do DAS.
 *
 * A SEFAZ autoriza do mesmo jeito: ela não conhece o regime de quem
 * emite. O problema aparece depois, no contador do comprador, que recebe
 * um crédito que não existe. Por isso avisa, não bloqueia — existe caso
 * legítimo, e travar o campo impediria quem sabe o que está fazendo.
 */
function avisoCst(cst: string | undefined | null, simples: boolean, nome: string): string | undefined {
  if (!simples) return undefined;
  return ["01", "02"].includes(String(cst ?? ""))
    ? `Este código destaca ${nome} na nota. Empresa do Simples costuma usar 49, porque já paga no DAS.`
    : undefined;
}

export function ProdutoForm({ form, setForm, editando }: Props) {
  const tipo = (form.tipo || "produto") as TipoItem;
  const servico = tipo === "servico";

  // Peso cubado: a transportadora cobra pelo maior entre o real e este.
  const cubagem = pesoParaCobranca(
    num(form.pesoBruto), num(form.comprimento), num(form.largura), num(form.altura));
  const pesoInformado = num(form.pesoBruto) > 0;
  const [envioAberto, setEnvioAberto] = useState(false);

  // O aviso do CST depende do regime: só faz sentido para o Simples.
  const { data: emitente } = useQuery<Emitter | null>({ queryKey: ["/api/emitter"] });
  // CSOSN só vale para CRT 1 e CRT 4 — é a regra da rejeição 591.
  //
  // O CRT 2 estava aqui dentro e engana: o nome é "Simples Nacional,
  // excesso de sublimite", mas quem passou do sublimite recolhe ICMS pelo
  // regime normal e o documento usa CST.
  const crt = String(emitente?.regimeTributario ?? "1").trim() || "1";
  const simples = ["1", "4"].includes(crt);

  // Recolhido em cadastro novo; aberto na edição, porque quem edita
  // normalmente veio justamente mexer no fiscal.
  const [fiscalAberto, setFiscalAberto] = useState(editando);

  function trocarTipo(novo: TipoItem) {
    if (novo === tipo) return;
    setForm({
      ...form,
      tipo: novo,
      cfop: cfopPadrao(novo),
      unidade: unidadePadrao(novo),
      csosn: novo === "servico" ? "400" : (form.csosn === "400" ? "102" : form.csosn || "102"),
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Tipo ─────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Rotulo campo="tipo" obrigatorio>Tipo</Rotulo>
        <div className="grid grid-cols-2 gap-2">
          {([
            ["produto", "Produto / Mercadoria", "border-primary bg-primary/10"],
            ["servico", "Serviço", "border-emerald-600 bg-emerald-600/10"],
          ] as [TipoItem, string, string][]).map(([v, rot, ativo]) => (
            <button
              key={v}
              type="button"
              onClick={() => trocarTipo(v)}
              aria-pressed={tipo === v}
              className={`h-11 rounded-md border text-base transition-colors ${
                tipo === v ? `${ativo} font-medium` : "hover:bg-accent text-muted-foreground"
              }`}
              data-testid={`tipo-${v}`}
            >
              {rot}
            </button>
          ))}
        </div>
      </div>

      {servico && (
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <p className="text-[13px] leading-relaxed">
            Dá para cadastrar o serviço agora, mas a emissão de nota de serviço
            ainda não está disponível — falta o bloco de ISSQN no gerador de XML.
            Os dados ficam salvos e passam a valer quando isso entrar.
          </p>
        </div>
      )}

      {/* ── Descrição primeiro: é o campo mais importante ────────────── */}
      <CampoTexto
        rotulo={servico ? "Descrição do serviço" : "Descrição do produto"}
        ajuda="descricao"
        obrigatorio
        value={form.descricao || ""}
        onChange={(v) => setForm({ ...form, descricao: v })}
        placeholder={servico ? "Ex: Instalação de ponto elétrico" : "Ex: Camiseta polo masculina azul P"}
        data-testid="input-product-descricao"
      />

      <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1.4fr] gap-3">
        <CampoTexto
          rotulo="Código"
          ajuda="codigo"
          obrigatorio
          mono
          value={form.codigo || ""}
          onChange={(v) => setForm({ ...form, codigo: v })}
          placeholder="PRD001"
          data-testid="input-product-codigo"
        />
        <CampoTexto
          rotulo="Valor unitário"
          ajuda="valorUnitario"
          obrigatorio
          inputMode="decimal"
          value={form.valorUnitario || ""}
          onChange={(v) => setForm({ ...form, valorUnitario: v.replace(/[^\d.,]/g, "") })}
          placeholder="Ex: 49,90"
          data-testid="input-product-valor"
        />
        <div className="col-span-2 md:col-span-1">
          <CampoSelect
            rotulo="Unidade"
            ajuda="unidade"
            obrigatorio
            valor={form.unidade || unidadePadrao(tipo)}
            onValor={(v) => setForm({ ...form, unidade: v })}
            opcoes={unidadePorTipo(tipo)}
            testId="select-product-unidade"
          />
        </div>
      </div>

      {/* ── Dados fiscais ────────────────────────────────────────────── */}
      <Collapsible
        open={fiscalAberto}
        onOpenChange={setFiscalAberto}
        className="rounded-lg border bg-muted/30"
      >
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full" data-testid="toggle-dados-fiscais">
            <CabecalhoSecao
              titulo="Dados fiscais"
              subtitulo="NCM, CFOP e ICMS — obrigatórios para emitir notas"
              aberto={fiscalAberto}
              icone={<Receipt className="h-4 w-4 shrink-0 text-primary" />}
              selo={temSt(form.csosn) ? <Badge variant="secondary">ST</Badge> : undefined}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="px-3 pb-4 space-y-4 border-t pt-4">
          {/* Campo mantido no lugar mesmo em serviço, desabilitado com o
              motivo — sumir fazia o diálogo pular de altura. */}
          {servico ? (
            <CampoTexto
              rotulo="NCM"
              ajuda="ncm"
              value=""
              disabled
              placeholder="Não se aplica a serviço"
              dica="Serviço é classificado pelo código da LC 116, não por NCM."
            />
          ) : (
            <CampoNcm
              valor={form.ncm || ""}
              onChange={(ncm) => setForm({ ...form, ncm })}
              onDescricaoSugerida={(d) =>
                setForm((f: any) => (f.descricao ? f : { ...f, descricao: d.slice(0, 120) }))}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <CampoCfop
                valor={(form.cfops as CfopOperacao[]) ?? (form.cfop
                  ? [{ operacao: "venda", interno: form.cfop,
                       externo: form.cfopInterestadual || "" }]
                  : [])}
                onChange={(lista) => {
                  // cfop/cfopInterestadual seguem espelhando a linha de
                  // venda: o resto do sistema (DANFE, listagens) lê deles.
                  const venda = lista.find((l) => l.operacao === "venda");
                  setForm({
                    ...form,
                    cfops: lista,
                    cfop: venda?.interno || cfopPadrao(tipo),
                    cfopInterestadual: venda?.externo || undefined,
                  });
                }}
                desabilitado={servico}
              />
            </div>
            {/* O campo muda com o regime da empresa: quem é do Simples vê
                CSOSN, quem é do regime normal vê CST. Mostrar os dois
                confundiria justamente quem não domina o assunto — e a
                maioria não domina. */}
            {simples ? (
              <CampoSelect
                rotulo="Situação do ICMS"
                ajuda="csosn"
                obrigatorio
                valor={form.csosn || "102"}
                onValor={(v) => setForm({ ...form, csosn: v })}
                opcoes={csosnPorTipo(tipo)}
                desabilitado={servico}
                dica={servico ? "Serviço não tem ICMS." : undefined}
                testId="select-product-csosn"
              />
            ) : (
              <CampoSelect
                rotulo="Situação do ICMS"
                ajuda="csosn"
                valor={form.cstIcms || ""}
                onValor={(v) => setForm({ ...form, cstIcms: v })}
                opcoes={CST_ICMS}
                desabilitado={servico}
                dica={servico
                  ? "Serviço não tem ICMS."
                  : "Em branco, usamos isento (40). Se seus produtos pagam "
                    + "ICMS, escolha 00 e informe a alíquota."}
                testId="select-product-cst"
              />
            )}
          </div>

          <BlocoSt form={form} setForm={setForm} />

          {/* ── Opcionais ───────────────────────────────────────────── */}
          <div className="border-t pt-4 space-y-3">
            <p className={ESCALA.subtituloSecao}>Opcionais</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <CampoTexto
                rotulo="Código de barras"
                ajuda="ean"
                mono
                value={servico ? "" : (form.ean || "")}
                onChange={(v) => setForm({ ...form, ean: v })}
                placeholder={servico ? "Não se aplica a serviço" : "SEM GTIN"}
                disabled={servico}
                data-testid="input-product-ean"
              />
              <CampoSelect
                rotulo="Origem"
                ajuda="origem"
                valor={form.origem || "0"}
                onValor={(v) => setForm({ ...form, origem: v })}
                opcoes={ORIGEM_OPCOES}
                desabilitado={servico}
                testId="select-product-origem"
              />
              <CampoTexto
                rotulo="CST PIS"
                ajuda="cstPis"
                mono
                value={form.cstPis || ""}
                onChange={(v) => setForm({ ...form, cstPis: v.replace(/\D/g, "").slice(0, 2) })}
                placeholder="49"
                dica={avisoCst(form.cstPis, simples, "PIS")}
                data-testid="input-product-cst-pis"
              />
              <CampoTexto
                rotulo="CST COFINS"
                ajuda="cstCofins"
                mono
                value={form.cstCofins || ""}
                onChange={(v) => setForm({ ...form, cstCofins: v.replace(/\D/g, "").slice(0, 2) })}
                placeholder="49"
                dica={avisoCst(form.cstCofins, simples, "COFINS")}
                data-testid="input-product-cst-cofins"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Envio ────────────────────────────────────────────────────
          Serviço não é embalado nem transportado, então some inteiro. */}
      {!servico && (
        <Collapsible open={envioAberto} onOpenChange={setEnvioAberto}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-4 py-3 text-sm hover:bg-accent">
            <span className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              Peso e medidas
              {pesoInformado && (
                <span className="text-[13px] text-muted-foreground font-normal">
                  · {formatarPeso(num(form.pesoBruto))}
                </span>
              )}
            </span>
            {/* Segue o estado em vez de um seletor por atributo: o
                data-state fica no elemento do Radix, e o seletor girava a
                seta mesmo com o bloco fechado. */}
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${envioAberto ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>

          <CollapsibleContent className="px-4 pt-4 pb-1 space-y-4">
            <p className={ESCALA.dica}>
              O peso vai na nota fiscal — transportadora costuma pedir, e a
              coleta trava sem ele. As medidas ficam só aqui, para estimar o
              frete.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <CampoTexto
                rotulo="Peso bruto (kg)"
                value={form.pesoBruto || ""}
                onChange={(v) => setForm({ ...form, pesoBruto: v })}
                placeholder="0,200"
                dica="Com a embalagem, como vai ser pesado."
                data-testid="input-produto-peso-bruto"
              />
              <CampoTexto
                rotulo="Peso líquido (kg)"
                value={form.pesoLiquido || ""}
                onChange={(v) => setForm({ ...form, pesoLiquido: v })}
                placeholder="0,180"
                dica="Só o produto. Em branco, usa o bruto."
                data-testid="input-produto-peso-liquido"
              />
            </div>

            <div>
              <Rotulo>Medidas da embalagem (cm)</Rotulo>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {([
                  ["comprimento", "Comprimento"],
                  ["largura", "Largura"],
                  ["altura", "Altura"],
                ] as [string, string][]).map(([campo, rot]) => (
                  <CampoTexto
                    key={campo}
                    rotulo=""
                    value={(form as any)[campo] || ""}
                    onChange={(v) => setForm({ ...form, [campo]: v })}
                    placeholder={rot}
                    data-testid={`input-produto-${campo}`}
                  />
                ))}
              </div>
            </div>

            {/* O peso cubado só aparece quando muda alguma coisa: mostrar
                sempre viraria ruído, e o número só importa quando ele é
                MAIOR que o real — é aí que a conta do frete sobe. */}
            {cubagem.cobraPeloCubado && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <p className="text-[13px] leading-relaxed">
                  A transportadora vai cobrar por{" "}
                  <strong>{formatarPeso(cubagem.cubado)}</strong>, não pelos{" "}
                  {formatarPeso(num(form.pesoBruto))} reais. Volume grande e leve
                  ocupa lugar no caminhão, e a cobrança segue o maior entre os dois.
                </p>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Variações não existem para serviço, mas o bloco é recolhido e ocupa
          uma linha só — some sem causar salto perceptível. */}
      {!servico && (
        <BlocoVariacoes
          variacoes={(form.variacoes as Variacao[]) || []}
          onChange={(variacoes) =>
            setForm({ ...form, variacoes: variacoes.length ? variacoes : undefined })}
          precoBase={form.valorUnitario}
          codigoBase={form.codigo}
        />
      )}
    </div>
  );
}
