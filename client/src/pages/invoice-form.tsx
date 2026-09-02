import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SecaoOperacao } from "@/components/secao-operacao";
import { PassosEmissao, calcularPassos, podeEmitir } from "@/components/passos-emissao";
import { BannerContato, PopupBuscarContato } from "@/components/contato-banner";
import { useContatoPorDocumento, contatoParaDestinatario } from "@/hooks/use-contatos";
import { SeletorProduto, type OpcaoProduto } from "@/components/seletor-produto";
import { AvisoIbpt } from "@/components/aviso-ibpt";
import { PainelValidacao } from "@/components/painel-validacao";
import { regrasDe } from "@shared/form-rules";
import { getOperacao } from "@shared/operacoes";
import { num } from "@shared/numeros";

/** Pares que não são simétricos: 5405 vira 6404, não 6405. */
const PARES_CFOP_UI: Record<string, string> = {
  "5405": "6404", "6404": "5405", "5403": "6403", "6403": "5403",
  "5401": "6401", "6401": "5401", "5411": "6411", "6411": "5411",
  "5409": "6409", "6409": "5409",
};
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, X, Plus, Trash2, FileText, Loader2, AlertCircle } from "lucide-react";
import { maskCnpj, maskCpf, maskCep, maskPhone, isValidCpf, isValidCnpj, maskIe } from "@/lib/masks";
import { useCep } from "@/hooks/use-lookup";
import { useRoute } from "wouter";
import type { Product, Emitter, Invoice, InvoiceItem, InsertInvoice, InsertInvoiceItem } from "@shared/schema";

const ufOptions = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

const naturezaOptions = [
  "Venda",
  "Venda de mercadoria",
  "Bonificação",
  "Devolução",
  "Remessa para conserto",
  "Transferência",
];

interface InvoiceItemForm {
  productId: number | null;
  /** Vem do produto e segue para o bloco de volumes do XML. */
  pesoBruto?: string;
  pesoLiquido?: string;
  descricao: string;
  codigo: string;
  ncm: string;
  cfop: string;
  /** CFOP quando o destino é outro estado. O servidor escolhe pelo destino. */
  cfopInterestadual?: string;
  /** CFOP por operação — o servidor usa o da operação da nota. */
  cfops?: { operacao: string; interno: string; externo: string }[];
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
  /** Regime normal usa CST no lugar de CSOSN — ver rejeição 591. */
  cstIcms?: string;
  ean: string;
  origem: string;
  csosn: string;
  cstPis: string;
  cstCofins: string;
  // Substituição tributária vinda do produto. Sem isto, um produto cadastrado
  // com CSOSN 500 entrava na nota SEM os valores de ST retido — o builder
  // montava o ICMSSN500 vazio e o total de ST saía zerado (rejeição 533).
  aliqIcms?: string;
  modBcSt?: string;
  pMvaSt?: string;
  vBcSt?: string;
  pIcmsSt?: string;
  vIcmsSt?: string;
  vBcStRet?: string;
  pSt?: string;
  vIcmsStRet?: string;
  /** Devolução: de qual item da nota original este item veio. */
  refChaveAcesso?: string;
  refNItem?: string;
}

function getNow() {
  const now = new Date();
  const date = now.toLocaleDateString("pt-BR");
  const time = now.toLocaleTimeString("pt-BR");
  return { date, time };
}

export default function InvoiceForm() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { date: nowDate, time: nowTime } = getNow();
  const [matched, params] = useRoute("/invoices/:id/edit");
  const editId = matched ? params?.id : null;
  const isEdit = !!editId;

  const { data: emitter } = useQuery<Emitter | null>({
    queryKey: ["/api/emitter"],
  });
  const { data: products } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: existingData, isLoading: loadingExisting } = useQuery<{ invoice: Invoice; items: InvoiceItem[] }>({
    queryKey: ["/api/invoices", editId],
    enabled: isEdit,
  });

  const [formLoaded, setFormLoaded] = useState(false);

  const [form, setForm] = useState<Partial<InsertInvoice>>({
    serie: "",   // vem do emitente ao carregar
    naturezaOperacao: "Venda de mercadoria",
    tipoOperacao: "venda",
    tipoSaida: "1",
    finalidade: "1",
    indicadorPresenca: "0",
    dataEmissao: nowDate,
    horaEmissao: nowTime,
    dataSaida: nowDate,
    horaSaida: nowTime,
    destNome: "",
    destTipoPessoa: "F",
    destCpfCnpj: "",
    destCep: "",
    destUf: "",
    destMunicipio: "",
    destCodigoMunicipio: "",
    destBairro: "",
    destLogradouro: "",
    destNumero: "",
    destComplemento: "",
    destTelefone: "",
    destEmail: "",
    consumidorFinal: true,
    valorFrete: "0",
    valorSeguro: "0",
    outrasDespesas: "0",
    desconto: "0",
    modalidadeFrete: "9",
    informacoesComplementares: "",
    status: "rascunho",
  });

  const [items, setItems] = useState<InvoiceItemForm[]>([]);
  const [popupContato, setPopupContato] = useState(false);
  // Reconhece o documento digitado. Não preenche: só mostra que existe cadastro.
  const { contato, dispensar } = useContatoPorDocumento(form.destCpfCnpj || "");
  // A série vem do cadastro do emitente. Ficava "1" chumbado, então quem
  // usa outra série emitia na errada sem perceber.
  useEffect(() => {
    if (emitter?.serie && !form.serie) {
      setForm((f: any) => ({ ...f, serie: emitter.serie }));
    }
  }, [emitter?.serie]);

  const regras = regrasDe(form.tipoOperacao || "venda");

  // O CEP do destinatário preenche o endereço e, principalmente, o código
  // IBGE do município — que vira <cMun> no XML. Digitado à mão, erra e
  // volta rejeição 270.
  //
  // Este formulário não tinha a busca: só o cadastro do emitente tinha.
  // Quem emitia para cliente novo precisava saber o código do município de
  // cabeça, ou deixava zerado.
  /**
   * CFOP que a nota vai usar para este item.
   *
   * Espelha a regra do servidor: pega o do cadastro para a operação
   * escolhida e ajusta o prefixo ao destino (5xxx dentro do estado, 6xxx
   * para fora). Mostrar aqui evita a surpresa de ver um código na tela e
   * outro sair no XML.
   */
  function cfopDoItem(item: InvoiceItemForm): string {
    const tipoOp = form.tipoOperacao || "venda";
    const ufEmit = String(emitter?.uf ?? "");
    const ufDest = String(form.destUf ?? "");
    const fora = !!(ufEmit && ufDest && ufEmit !== ufDest);

    // Mesma precedência do servidor: a OPERAÇÃO manda, e o produto só
    // entra se tiver CFOP cadastrado para ela.
    const escolhido = item.cfops?.find((c) => c.operacao === tipoOp);
    const bruto = fora
      ? (escolhido?.externo || escolhido?.interno)
      : (escolhido?.interno || escolhido?.externo);

    const cod = String(bruto ?? "").replace(/\D/g, "");
    if (cod.length !== 4) {
      // Sem CFOP próprio, o servidor usa o padrão da operação.
      try {
        const op = getOperacao(tipoOp);
        return fora ? op.cfopInterestadual : op.cfopEstadual;
      } catch { return "—"; }
    }

    const interno = cod[0] === "5" || cod[0] === "1";
    if (interno === !fora) return cod;
    const entrada = cod[0] === "1" || cod[0] === "2";
    const prefixo = entrada ? (fora ? "2" : "1") : (fora ? "6" : "5");
    return PARES_CFOP_UI[cod] ?? prefixo + cod.slice(1);
  }

  const cepDest = useCep((end) => {
    setForm((f: any) => ({
      ...f,
      destLogradouro: end.logradouro || f.destLogradouro,
      destBairro: end.bairro || f.destBairro,
      destMunicipio: end.municipio || f.destMunicipio,
      destUf: end.uf || f.destUf,
      destCodigoMunicipio: end.codigoMunicipio || f.destCodigoMunicipio,
      // A IE do destinatário é formatada pela UF dele.
      destInscricaoEstadual: f.destInscricaoEstadual
        ? maskIe(f.destInscricaoEstadual, end.uf || f.destUf)
        : f.destInscricaoEstadual,
    }));
  });

  const [importandoItens, setImportandoItens] = useState(false);

  async function importarItensDaChave(chave: string) {
    setImportandoItens(true);
    try {
      const r = await fetch(`/api/invoices/por-chave/${chave}`, { credentials: "include" });
      const dados = await r.json();
      if (!r.ok) {
        toast({ title: "Não deu para puxar", description: dados.message, variant: "destructive" });
        return;
      }
      setItems(dados.itens.map((i: any) => ({
        productId: i.productId ?? null,
        descricao: i.descricao, codigo: i.codigo, ncm: i.ncm, cfop: i.cfop,
        unidade: i.unidade, quantidade: i.quantidade,
        valorUnitario: i.valorUnitario, valorTotal: i.valorTotal,
        ean: i.ean || "SEM GTIN", origem: i.origem || "0",
        csosn: i.csosn || "102", cstPis: i.cstPis || "49", cstCofins: i.cstCofins || "49",
        // O CST vai junto para o servidor. Ele é quem decide o bloco de
        // ICMS quando o emitente é de regime normal.
        cstIcms: i.cstIcms ?? undefined,
        aliqIcms: i.aliqIcms, modBcSt: i.modBcSt, pMvaSt: i.pMvaSt,
        vBcSt: i.vBcSt, pIcmsSt: i.pIcmsSt, vIcmsSt: i.vIcmsSt,
        vBcStRet: i.vBcStRet, pSt: i.pSt, vIcmsStRet: i.vIcmsStRet,
        // Referência por item (NT 2025.002): guarda de qual item da nota
        // original este veio. Em devolução parcial os números divergem.
        refChaveAcesso: i.refChaveAcesso, refNItem: i.refNItem,
      })));
      toast({
        title: `${dados.itens.length} item(ns) da nota ${dados.numero}`,
        // Devolução parcial é o caso comum: o cliente devolve 2 de 10.
        description: "Confira as quantidades — em devolução parcial, ajuste quanto está voltando de cada item.",
      });
    } catch (e: any) {
      toast({ title: "Erro ao buscar a nota", description: e.message, variant: "destructive" });
    } finally {
      setImportandoItens(false);
    }
  }

  function aplicarContato(c: any) {
    setForm((f: any) => ({ ...f, ...contatoParaDestinatario(c) }));
    dispensar();
  }

  useEffect(() => {
    if (isEdit && existingData && !formLoaded) {
      const inv = existingData.invoice;
      setForm({
        serie: inv.serie,
        naturezaOperacao: inv.naturezaOperacao,
        tipoSaida: inv.tipoSaida,
        finalidade: inv.finalidade,
        indicadorPresenca: inv.indicadorPresenca,
        dataEmissao: inv.dataEmissao,
        horaEmissao: inv.horaEmissao,
        dataSaida: inv.dataSaida || "",
        horaSaida: inv.horaSaida || "",
        destNome: inv.destNome,
        destTipoPessoa: inv.destTipoPessoa,
        destCpfCnpj: inv.destCpfCnpj,
        destInscricaoEstadual: inv.destInscricaoEstadual || "",
        destCep: inv.destCep || "",
        destUf: inv.destUf || "",
        destMunicipio: inv.destMunicipio || "",
        destCodigoMunicipio: inv.destCodigoMunicipio || "",
        destBairro: inv.destBairro || "",
        destLogradouro: inv.destLogradouro || "",
        destNumero: inv.destNumero || "",
        destComplemento: inv.destComplemento || "",
        destTelefone: inv.destTelefone || "",
        destEmail: inv.destEmail || "",
        consumidorFinal: inv.consumidorFinal ?? true,
        valorFrete: inv.valorFrete || "0",
        valorSeguro: inv.valorSeguro || "0",
        outrasDespesas: inv.outrasDespesas || "0",
        desconto: inv.desconto || "0",
        modalidadeFrete: inv.modalidadeFrete || "9",
        informacoesComplementares: inv.informacoesComplementares || "",
        status: "rascunho",
      });
      setItems(existingData.items.map((item) => ({
        productId: item.productId,
        descricao: item.descricao,
        codigo: item.codigo,
        ncm: item.ncm,
        cfop: item.cfop,
        unidade: item.unidade,
        quantidade: item.quantidade,
        valorUnitario: item.valorUnitario,
        valorTotal: item.valorTotal,
        ean: item.ean || "SEM GTIN",
        origem: item.origem || "0",
        csosn: item.csosn || "102",
        // Sem isto, abrir uma nota salva perderia o CST e ela voltaria a
        // sair só com CSOSN na reemissão.
        cstIcms: (item as any).cstIcms ?? undefined,
        cstPis: item.cstPis || "49",
        cstCofins: item.cstCofins || "49",
      })));
      setFormLoaded(true);
    }
  }, [isEdit, existingData, formLoaded]);

  const totals = useMemo(() => {
    const totalProdutos = items.reduce((sum, item) => {
      return sum + (num(item.valorTotal) || 0);
    }, 0);
    const frete = num(form.valorFrete || "0") || 0;
    const seguro = num(form.valorSeguro || "0") || 0;
    const despesas = num(form.outrasDespesas || "0") || 0;
    const desconto = num(form.desconto || "0") || 0;
    const totalNota = totalProdutos + frete + seguro + despesas - desconto;
    return { totalProdutos, totalNota };
  }, [items, form.valorFrete, form.valorSeguro, form.outrasDespesas, form.desconto]);

  function addItem() {
    setItems([
      ...items,
      {
        productId: null,
        descricao: "",
        codigo: "",
        ncm: "",
        cfop: "5102",
        unidade: "UN",
        quantidade: "1",
        valorUnitario: "",
        valorTotal: "0",
        ean: "SEM GTIN",
        origem: "0",
        csosn: "102",
        cstPis: "49",
        cstCofins: "49",
      },
    ]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: string, value: string) {
    const updated = [...items];
    (updated[index] as any)[field] = value;

    if (field === "quantidade" || field === "valorUnitario") {
      // Usa a MESMA função do servidor. Com parseFloat, "24,50" virava 24
      // aqui e 24.50 lá — a nota ia com vProd diferente de qCom × vUnCom e
      // voltava rejeição 629. No teclado numérico brasileiro a tecla
      // decimal produz vírgula, então isso acontecia o tempo todo.
      updated[index].valorTotal =
        (num(updated[index].quantidade) * num(updated[index].valorUnitario)).toFixed(2);
    }

    setItems(updated);
  }

  function selectProduct(index: number, opcao: OpcaoProduto) {
    const product = products?.find((p) => p.id === opcao.produtoId);
    if (!product) return;
    const updated = [...items];
    updated[index] = {
      productId: product.id,
      // Identidade vem da opção: variação tem código, descrição e preço
      // próprios. NCM, CFOP e ICMS vêm do produto-pai, porque classificação
      // fiscal não muda entre tamanho P e G.
      descricao: opcao.descricao,
      codigo: opcao.codigo,
      ncm: product.ncm,
      cfop: product.cfop,
      cfopInterestadual: (product as any).cfopInterestadual,
      cfops: (product as any).cfops,
      unidade: product.unidade,
      quantidade: updated[index].quantidade || "1",
      valorUnitario: opcao.valorUnitario,
      valorTotal: (num(updated[index].quantidade || "1") * num(opcao.valorUnitario)).toFixed(2),
      ean: opcao.ean || "SEM GTIN",
      origem: product.origem,
      // O peso acompanha o produto até o XML: sem isto o bloco de volumes
      // sai vazio e a transportadora fica sem a informação que pede.
      pesoBruto: product.pesoBruto ?? undefined,
      pesoLiquido: product.pesoLiquido ?? undefined,
      csosn: product.csosn || "102",
      // O CST acompanha o produto até a nota. Sem isto o cadastro de CST
      // não serviria para nada: o item chegaria ao XML só com CSOSN, e
      // emitente de regime normal tomaria a rejeição 591.
      cstIcms: (product as any).cstIcms ?? undefined,
      cstPis: product.cstPis || "49",
      cstCofins: product.cstCofins || "49",
      // Os campos de ST acompanham o produto. Digitar de novo na nota seria
      // convite a divergir do cadastro.
      aliqIcms: product.aliqIcms || undefined,
      modBcSt: product.modBcSt || undefined,
      pMvaSt: product.pMvaSt || undefined,
      vBcSt: product.vBcSt || undefined,
      pIcmsSt: product.pIcmsSt || undefined,
      vIcmsSt: product.vIcmsSt || undefined,
      vBcStRet: product.vBcStRet || undefined,
      pSt: product.pSt || undefined,
      vIcmsStRet: product.vIcmsStRet || undefined,
    };
    setItems(updated);
  }

  const saveMutation = useMutation({
    mutationFn: async (data: { invoice: Partial<InsertInvoice>; items: InvoiceItemForm[] }) => {
      if (isEdit) {
        const res = await apiRequest("PUT", `/api/invoices/${editId}`, data);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/invoices", data);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      if (isEdit) {
        queryClient.invalidateQueries({ queryKey: ["/api/invoices", editId] });
      }
      toast({ title: isEdit ? "Nota fiscal atualizada com sucesso" : "Nota fiscal salva com sucesso" });
      navigate(isEdit ? `/invoices/${editId}` : "/invoices");
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar nota", description: err.message, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.destNome || !form.destCpfCnpj || !form.naturezaOperacao) {
      toast({ title: "Preencha os dados do destinatário", variant: "destructive" });
      return;
    }
    const cpfCnpjDigits = form.destCpfCnpj.replace(/\D/g, "");
    if (form.destTipoPessoa === "J") {
      if (!isValidCnpj(cpfCnpjDigits)) {
        toast({ title: "CNPJ do destinatário inválido", description: "Verifique os dígitos e tente novamente.", variant: "destructive" });
        return;
      }
    } else {
      if (!isValidCpf(cpfCnpjDigits)) {
        toast({ title: "CPF do destinatário inválido", description: "Verifique os dígitos e tente novamente.", variant: "destructive" });
        return;
      }
    }
    if (items.length === 0) {
      toast({ title: "Adicione pelo menos um item", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      invoice: {
        ...form,
        totalProdutos: totals.totalProdutos.toFixed(2),
        totalNota: totals.totalNota.toFixed(2),
      },
      items,
    });
  }

  if (isEdit && loadingExisting) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-invoice-form-title">{isEdit ? "Editar Nota Fiscal" : "Nova Nota Fiscal"}</h1>
          <p className="text-muted-foreground text-sm mt-1">{isEdit ? `Editando NF-e ${existingData?.invoice.numero || ""}` : "NF-e Modelo 55"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/invoices")} data-testid="button-cancel-invoice">
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saveMutation.isPending} data-testid="button-save-invoice">
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <PassosEmissao
        passos={calcularPassos({
          destNome: form.destNome,
          destCpfCnpj: form.destCpfCnpj,
          qtdItens: items.length,
          totalNota: totals.totalNota,
        })}
      />

      <PainelValidacao
        dados={{
          emitente: {
            regimeTributario: emitter?.regimeTributario,
            cnpj: emitter?.cnpj, uf: emitter?.uf,
            inscricaoEstadual: emitter?.inscricaoEstadual,
            codigoMunicipio: emitter?.codigoMunicipio,
            razaoSocial: emitter?.razaoSocial,
          },
          nota: { ...form, totalNota: String(totals.totalNota) } as any,
          itens: items as any,
        }}
      />

      <AvisoIbpt uf={emitter?.uf} />

      <PopupBuscarContato
        aberto={popupContato}
        onFechar={() => setPopupContato(false)}
        onEscolher={aplicarContato}
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Dados da Nota
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SecaoOperacao
              form={form}
              setForm={setForm}
              onImportarItens={importarItensDaChave}
              importando={importandoItens}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[15px] font-medium text-muted-foreground">Série</Label>
                <Input value={form.serie || ""} onChange={(e) => setForm((f) => ({ ...f, serie: e.target.value }))} className="h-11 text-base" data-testid="input-serie" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Data de Emissão</Label>
                <Input value={form.dataEmissao || ""} onChange={(e) => setForm((f) => ({ ...f, dataEmissao: e.target.value }))} data-testid="input-data-emissao" />
              </div>
              <div className="space-y-2">
                <Label>Hora de Emissão</Label>
                <Input value={form.horaEmissao || ""} onChange={(e) => setForm((f) => ({ ...f, horaEmissao: e.target.value }))} data-testid="input-hora-emissao" />
              </div>
              <div className="space-y-2">
                <Label>Data Saída</Label>
                <Input value={form.dataSaida || ""} onChange={(e) => setForm((f) => ({ ...f, dataSaida: e.target.value }))} data-testid="input-data-saida" />
              </div>
              <div className="space-y-2">
                <Label>Hora Saída</Label>
                <Input value={form.horaSaida || ""} onChange={(e) => setForm((f) => ({ ...f, horaSaida: e.target.value }))} data-testid="input-hora-saida" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Indicador de Presença</Label>
                <Select value={form.indicadorPresenca || "0"} onValueChange={(v) => setForm((f) => ({ ...f, indicadorPresenca: v }))}>
                  <SelectTrigger data-testid="select-presenca">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0 - Não se aplica</SelectItem>
                    <SelectItem value="1">1 - Presencial</SelectItem>
                    <SelectItem value="2">2 - Internet</SelectItem>
                    <SelectItem value="3">3 - Teleatendimento</SelectItem>
                    <SelectItem value="4">4 - Entrega a domicílio</SelectItem>
                    <SelectItem value="9">9 - Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Consumidor Final</Label>
                <Select
                  value={form.consumidorFinal ? "true" : "false"}
                  onValueChange={(v) => setForm((f) => ({ ...f, consumidorFinal: v === "true" }))}
                >
                  <SelectTrigger data-testid="select-consumidor-final">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Sim</SelectItem>
                    <SelectItem value="false">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {emitter && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Emitente (pré-preenchido)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Razão Social</p>
                  <p className="text-sm font-medium" data-testid="text-emitter-razao">{emitter.razaoSocial}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CNPJ</p>
                  <p className="text-sm font-medium">{emitter.cnpj}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">IE</p>
                  <p className="text-sm font-medium">{emitter.inscricaoEstadual || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Endereço</p>
                  <p className="text-sm font-medium">
                    {emitter.logradouro}, {emitter.numero} - {emitter.bairro}, {emitter.municipio}/{emitter.uf}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Regime Tributário</p>
                  <p className="text-sm font-medium">
                    {emitter.regimeTributario === "1" ? "Simples Nacional" : emitter.regimeTributario === "3" ? "Regime Normal" : "SN - Excesso"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
              <span>Destinatário</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPopupContato(true)}
                data-testid="button-buscar-cliente"
              >
                Buscar cliente
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Aparece quando o documento digitado bate com um cadastro.
                Nunca preenche sozinho — ver nota em use-contatos.ts. */}
            {contato && (
              <BannerContato
                contato={contato}
                onUsar={() => aplicarContato(contato)}
                onDispensar={dispensar}
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2 sm:col-span-2 lg:col-span-2">
                <Label>Nome do Contato *</Label>
                <Input value={form.destNome || ""} onChange={(e) => setForm((f) => ({ ...f, destNome: e.target.value }))} placeholder="Nome completo" data-testid="input-dest-nome" />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Pessoa</Label>
                <Select value={form.destTipoPessoa || "F"} onValueChange={(v) => setForm((f) => ({ ...f, destTipoPessoa: v }))}>
                  <SelectTrigger data-testid="select-dest-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="F">Física</SelectItem>
                    <SelectItem value="J">Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{form.destTipoPessoa === "J" ? "CNPJ *" : "CPF *"}</Label>
                <Input
                  value={form.destCpfCnpj || ""}
                  onChange={(e) => setForm((f) => ({ ...f, destCpfCnpj: f.destTipoPessoa === "J" ? maskCnpj(e.target.value) : maskCpf(e.target.value) }))}
                  placeholder={form.destTipoPessoa === "J" ? "00.000.000/0000-00" : "000.000.000-00"}
                  maxLength={form.destTipoPessoa === "J" ? 18 : 14}
                  data-testid="input-dest-cpf-cnpj"
                />
              </div>
              {form.destTipoPessoa === "J" && (
                <div className="space-y-2">
                  <Label>Inscrição Estadual</Label>
                  <Input
                    value={form.destInscricaoEstadual || ""}
                    onChange={(e) => setForm((f) => ({ ...f, destInscricaoEstadual: maskIe(e.target.value, f.destUf) }))}
                    placeholder="ISENTO se não for contribuinte"
                    data-testid="input-dest-ie"
                  />
                </div>
              )}
            </div>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>CEP</Label>
                <div className="relative">
                  <Input
                    value={form.destCep || ""}
                    onChange={(e) => {
                      const v = maskCep(e.target.value);
                      setForm((f) => ({ ...f, destCep: v }));
                      cepDest.consultar(v);
                    }}
                    placeholder="00000-000"
                    maxLength={9}
                    data-testid="input-dest-cep"
                  />
                  {cepDest.buscando && (
                    <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-3 text-muted-foreground" />
                  )}
                </div>
                {cepDest.erro && (
                  <p className="text-[13px] text-destructive flex items-start gap-1">
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {cepDest.erro}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>UF</Label>
                <Select value={form.destUf || ""} onValueChange={(v) => setForm((f) => ({ ...f, destUf: v }))}>
                  <SelectTrigger data-testid="select-dest-uf">
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {ufOptions.map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Município</Label>
                <Input value={form.destMunicipio || ""} onChange={(e) => setForm((f) => ({ ...f, destMunicipio: e.target.value }))} placeholder="Município" data-testid="input-dest-municipio" />
              </div>
              <div className="space-y-2">
                <Label>Cód. IBGE Município</Label>
                <Input value={form.destCodigoMunicipio || ""} onChange={(e) => setForm((f) => ({ ...f, destCodigoMunicipio: e.target.value.replace(/\D/g, "").slice(0, 7) }))} placeholder="0000000" maxLength={7} data-testid="input-dest-codigo-municipio" />
              </div>
              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input value={form.destBairro || ""} onChange={(e) => setForm((f) => ({ ...f, destBairro: e.target.value }))} placeholder="Bairro" data-testid="input-dest-bairro" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Endereço</Label>
                <Input value={form.destLogradouro || ""} onChange={(e) => setForm((f) => ({ ...f, destLogradouro: e.target.value }))} placeholder="Logradouro" data-testid="input-dest-logradouro" />
              </div>
              <div className="space-y-2">
                <Label>Número</Label>
                <Input value={form.destNumero || ""} onChange={(e) => setForm((f) => ({ ...f, destNumero: e.target.value }))} placeholder="Nº" data-testid="input-dest-numero" />
              </div>
              <div className="space-y-2">
                <Label>Complemento</Label>
                <Input value={form.destComplemento || ""} onChange={(e) => setForm((f) => ({ ...f, destComplemento: e.target.value }))} placeholder="Complemento" data-testid="input-dest-complemento" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.destTelefone || ""} onChange={(e) => setForm((f) => ({ ...f, destTelefone: maskPhone(e.target.value) }))} placeholder="(00) 00000-0000" maxLength={15} data-testid="input-dest-telefone" />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input value={form.destEmail || ""} onChange={(e) => setForm((f) => ({ ...f, destEmail: e.target.value }))} placeholder="email@exemplo.com" data-testid="input-dest-email" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base flex items-baseline gap-2 flex-wrap">
              <span>Itens</span>
              {items.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground tabular-nums" data-testid="text-subtotal-itens">
                  {items.length} {items.length === 1 ? "item" : "itens"} ·{" "}
                  {totals.totalProdutos.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              )}
            </CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addItem} data-testid="button-add-item">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Item
            </Button>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum item adicionado</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addItem} data-testid="button-add-first-item">
                  Adicionar primeiro item
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="p-4 rounded-md border bg-muted/20 space-y-3" data-testid={`invoice-item-${index}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-muted-foreground">Item {index + 1}</span>
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeItem(index)} data-testid={`button-remove-item-${index}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">Produto</Label>
                        <SeletorProduto
                          produtos={products || []}
                          valorAtual={item.codigo}
                          onEscolher={(o) => selectProduct(index, o)}
                          testId={`select-product-${index}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Código</Label>
                        <Input value={item.codigo} onChange={(e) => updateItem(index, "codigo", e.target.value)} className="text-sm" data-testid={`input-item-codigo-${index}`} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">NCM</Label>
                        <Input value={item.ncm} onChange={(e) => updateItem(index, "ncm", e.target.value)} className="text-sm" data-testid={`input-item-ncm-${index}`} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Descrição</Label>
                      <Input value={item.descricao} onChange={(e) => updateItem(index, "descricao", e.target.value)} className="text-sm" data-testid={`input-item-descricao-${index}`} />
                    </div>

                    {/* Devolução: qual item da nota original este item devolve.
                        Em devolução parcial os números divergem — devolver o
                        item 5 de uma nota gera o item 1 aqui, mas a SEFAZ
                        espera a referência ao 5 (NT 2025.002). */}
                    {regras.exigeNfref && (
                      <div className="space-y-1">
                        <Label className="text-xs">Devolve o item nº da nota original</Label>
                        <Input
                          value={item.refNItem ?? String(index + 1)}
                          onChange={(e) => updateItem(index, "refNItem", e.target.value.replace(/\D/g, ""))}
                          inputMode="numeric"
                          className="text-sm font-mono max-w-28"
                          data-testid={`input-item-ref-nitem-${index}`}
                        />
                        <p className="text-[12px] text-muted-foreground">
                          Se você devolve a nota inteira, deixe como está.
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">UN</Label>
                        <Input value={item.unidade} onChange={(e) => updateItem(index, "unidade", e.target.value)} className="text-sm" data-testid={`input-item-unidade-${index}`} />
                      </div>
                      {/* CFOP não é editável aqui: ele vem do cadastro do
                          produto (que guarda um por operação) e do destino da
                          nota. Deixar editável foi o que gerou a rejeição 732
                          — o campo mostrava o código interestadual numa venda
                          interna, e nada avisava.

                          Para mudar, muda-se no produto: lá vale para todas
                          as notas, não só para esta. */}
                      <div className="space-y-1">
                        <Label className="text-xs">CFOP</Label>
                        <div
                          className="h-9 flex items-center rounded-md border bg-muted/50 px-3 text-sm font-mono"
                          title="Definido pelo cadastro do produto e pelo destino da nota"
                          data-testid={`texto-item-cfop-${index}`}
                        >
                          {cfopDoItem(item)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Qtde</Label>
                        <Input value={item.quantidade} onChange={(e) => updateItem(index, "quantidade", e.target.value)} className="text-sm" data-testid={`input-item-qtd-${index}`} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Preço Un (R$)</Label>
                        <Input value={item.valorUnitario} onChange={(e) => updateItem(index, "valorUnitario", e.target.value)} className="text-sm" data-testid={`input-item-preco-${index}`} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Total (R$)</Label>
                        <Input value={item.valorTotal} readOnly className="text-sm bg-muted/50 font-medium" data-testid={`input-item-total-${index}`} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Cálculo de Impostos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Total Produtos</Label>
                <Input value={totals.totalProdutos.toFixed(2)} readOnly className="bg-muted/50 font-mono font-medium" data-testid="input-total-produtos" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Frete (R$)</Label>
                <Input value={form.valorFrete || "0"} onChange={(e) => setForm((f) => ({ ...f, valorFrete: e.target.value }))} className="font-mono" data-testid="input-frete" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Seguro (R$)</Label>
                <Input value={form.valorSeguro || "0"} onChange={(e) => setForm((f) => ({ ...f, valorSeguro: e.target.value }))} className="font-mono" data-testid="input-seguro" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Outras Desp. (R$)</Label>
                <Input value={form.outrasDespesas || "0"} onChange={(e) => setForm((f) => ({ ...f, outrasDespesas: e.target.value }))} className="font-mono" data-testid="input-outras-despesas" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Desconto (R$)</Label>
                <Input value={form.desconto || "0"} onChange={(e) => setForm((f) => ({ ...f, desconto: e.target.value }))} className="font-mono" data-testid="input-desconto" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Total da Nota</Label>
                <Input value={totals.totalNota.toFixed(2)} readOnly className="bg-primary/10 font-mono font-bold text-primary" data-testid="input-total-nota" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Transporte</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Modalidade de Frete</Label>
              <Select value={form.modalidadeFrete || "9"} onValueChange={(v) => setForm((f) => ({ ...f, modalidadeFrete: v }))}>
                <SelectTrigger data-testid="select-frete">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 - CIF (Remetente)</SelectItem>
                  <SelectItem value="1">1 - FOB (Destinatário)</SelectItem>
                  <SelectItem value="2">2 - Terceiros</SelectItem>
                  <SelectItem value="3">3 - Próprio (Remetente)</SelectItem>
                  <SelectItem value="4">4 - Próprio (Destinatário)</SelectItem>
                  <SelectItem value="9">9 - Sem transporte</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Informações Adicionais</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Informações Complementares</Label>
              <Textarea
                value={form.informacoesComplementares || ""}
                onChange={(e) => setForm((f) => ({ ...f, informacoesComplementares: e.target.value }))}
                placeholder="Informações complementares da nota fiscal..."
                rows={3}
                data-testid="input-info-complementares"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="outline" onClick={() => navigate("/invoices")} data-testid="button-cancel-bottom">
            Cancelar
          </Button>
          <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-bottom">
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Salvando..." : "Salvar Nota Fiscal"}
          </Button>
        </div>
      </form>
    </div>
  );
}
