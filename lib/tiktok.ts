// lib/tiktok.ts
//
// Núcleo PURO da integração TikTok Shop (sem mongoose — importável em
// modo mock sem MONGODB_URI). Contém: assinatura HMAC das chamadas,
// troca/renovação de token, busca de pedidos, o ADAPTER que traduz o
// JSON cru do TikTok pro PEDIDO_NORMALIZADO (contrato do desktop), e
// os pedidos de demonstração do modo mock.
//
// CONTRATO desktop ↔ backend: ver services/tiktok.py no NF-e Desktop.
// O desktop NUNCA vê campos crus do TikTok — só o normalizado. Quando
// o JSON real do sandbox chegar (VERIFICACAO-TIKTOK.md, Fase 0), os
// ajustes ficam CONCENTRADOS nos pontos marcados com "TODO Fase 0".
//segredo do aplicativo 69aba020fad02a5f70ebd306deb31c57fc0b74da
//chave do aplicativo 6kjic2jrr7pc4
// Env vars (ver README-TIKTOK.md):
//   TIKTOK_MOCK=1            → modo demonstração (sem TikTok, sem Mongo)
//   TIKTOK_APP_KEY           → do Partner Center  
//   TIKTOK_APP_SECRET        → do Partner Center (NUNCA no desktop)
//   TIKTOK_SERVICE_ID        → id do link de autorização (app custom)
//   TIKTOK_AUTH_BASE         → default https://services.tiktokshop.com/open/authorize
//   TIKTOK_AUTH_API          → default https://auth.tiktok-shops.com
//   TIKTOK_API_BASE          → default https://open-api.tiktokglobalshop.com
//   TIKTOK_INVOICE_PATH      → endpoint BR de envio da NF-e (Fase 0 §0.3)

import crypto from 'crypto'

// ── Config ───────────────────────────────────────────────────────────

export const cfg = {
  appKey:      () => process.env.TIKTOK_APP_KEY || '',
  appSecret:   () => process.env.TIKTOK_APP_SECRET || '',
  serviceId:   () => process.env.TIKTOK_SERVICE_ID || '',
  authBase:    () => process.env.TIKTOK_AUTH_BASE ||
                     'https://services.tiktokshop.com/open/authorize',
  authApi:     () => process.env.TIKTOK_AUTH_API ||
                     'https://auth.tiktok-shops.com',
  apiBase:     () => process.env.TIKTOK_API_BASE ||
                     'https://open-api.tiktokglobalshop.com',
  invoicePath: () => process.env.TIKTOK_INVOICE_PATH || '',
}

export function mockAtivo(): boolean {
  return process.env.TIKTOK_MOCK === '1'
}

// ── Tipos do contrato normalizado ────────────────────────────────────

export interface PedidoNormalizado {
  order_id: string
  criado_em: string
  status: string
  tipo: 'venda' | 'presente' | 'amostra'
  comprador: { nome: string; cpf_cnpj: string; email?: string }
  endereco: {
    logradouro: string; numero: string; complemento: string
    bairro: string; municipio: string; uf: string; cep: string
    telefone: string; codigo_municipio_ibge?: string
  }
  itens: Array<{
    seller_sku: string; descricao: string
    quantidade: number; valor_unitario: number; desconto: number
  }>
  frete: number
  desconto_pedido: number
}

// ── Assinatura das chamadas (algoritmo oficial TikTok Shop) ──────────
// sign = HMAC-SHA256(app_secret,
//          app_secret + path + concat(chave+valor ordenados) + body
//          + app_secret) em hex.
// Params 'sign' e 'access_token' ficam FORA da assinatura.

export function assinar(
  path: string,
  params: Record<string, string>,
  body: string = '',
): string {
  const secret = cfg.appSecret()
  const chaves = Object.keys(params)
    .filter(k => k !== 'sign' && k !== 'access_token')
    .sort()
  const base = secret + path +
    chaves.map(k => k + params[k]).join('') + body + secret
  return crypto.createHmac('sha256', secret).update(base).digest('hex')
}

// ── Chamada genérica à API do TikTok ─────────────────────────────────

export async function chamarTikTok(opts: {
  method: 'GET' | 'POST'
  path: string
  accessToken: string
  shopCipher?: string
  query?: Record<string, string>
  body?: unknown
}): Promise<any> {
  const params: Record<string, string> = {
    app_key: cfg.appKey(),
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...(opts.shopCipher ? { shop_cipher: opts.shopCipher } : {}),
    ...(opts.query || {}),
  }
  const bodyStr = opts.body ? JSON.stringify(opts.body) : ''
  params.sign = assinar(opts.path, params, bodyStr)

  const qs = new URLSearchParams(params).toString()
  const resp = await fetch(`${cfg.apiBase()}${opts.path}?${qs}`, {
    method: opts.method,
    headers: {
      'content-type': 'application/json',
      'x-tts-access-token': opts.accessToken,
    },
    ...(bodyStr ? { body: bodyStr } : {}),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || (data && typeof data.code === 'number' && data.code !== 0)) {
    throw new Error(
      `TikTok ${opts.path}: ${data?.message || `HTTP ${resp.status}`}`)
  }
  return data?.data ?? data
}

// ── Tokens (auth code → tokens; refresh) ─────────────────────────────

export interface Tokens {
  access_token: string
  access_expira: number      // epoch segundos
  refresh_token: string
  refresh_expira: number
  seller_nome?: string
}

function extrairTokens(d: any): Tokens {
  return {
    access_token:  d?.access_token || '',
    access_expira: Number(d?.access_token_expire_in || 0),
    refresh_token: d?.refresh_token || '',
    refresh_expira: Number(d?.refresh_token_expire_in || 0),
    seller_nome:   d?.seller_name || '',
  }
}

export async function trocarAuthCode(code: string): Promise<Tokens> {
  const qs = new URLSearchParams({
    app_key: cfg.appKey(), app_secret: cfg.appSecret(),
    auth_code: code, grant_type: 'authorized_code',
  })
  const r = await fetch(`${cfg.authApi()}/api/v2/token/get?${qs}`)
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.code !== 0) {
    throw new Error(`token/get: ${j?.message || `HTTP ${r.status}`}`)
  }
  return extrairTokens(j.data)
}

export async function renovarToken(refreshToken: string): Promise<Tokens> {
  const qs = new URLSearchParams({
    app_key: cfg.appKey(), app_secret: cfg.appSecret(),
    refresh_token: refreshToken, grant_type: 'refresh_token',
  })
  const r = await fetch(`${cfg.authApi()}/api/v2/token/refresh?${qs}`)
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.code !== 0) {
    throw new Error(`token/refresh: ${j?.message || `HTTP ${r.status}`}`)
  }
  return extrairTokens(j.data)
}

// ── Lojas autorizadas (pra obter shop_id + cipher após o callback) ───

export async function lojasAutorizadas(accessToken: string) {
  const d = await chamarTikTok({
    method: 'GET', path: '/authorization/202309/shops', accessToken,
  })
  return (d?.shops || []) as Array<{
    id: string; name: string; cipher: string; region?: string
  }>
}

// ── Pedidos ──────────────────────────────────────────────────────────

// Mapeia o status do contrato pro status do TikTok.
// TODO Fase 0 (§0.2): confirmar o valor exato na doc BR market.
const STATUS_MAP: Record<string, string> = {
  AGUARDANDO_ENVIO: 'AWAITING_SHIPMENT',
}

export async function buscarPedidos(
  conn: { access_token: string; shop_cipher: string },
  statusDesk: string,
): Promise<any[]> {
  const statusTk = STATUS_MAP[statusDesk] || statusDesk
  const busca = await chamarTikTok({
    method: 'POST',
    path: '/order/202309/orders/search',
    accessToken: conn.access_token,
    shopCipher: conn.shop_cipher,
    query: { page_size: '50' },
    // TODO Fase 0 (§0.2): confirmar o nome do filtro na doc BR
    body: { order_status: statusTk },
  })
  const ids: string[] = (busca?.orders || []).map((o: any) => String(o.id))
  if (!ids.length) return []
  const det = await chamarTikTok({
    method: 'GET',
    path: '/order/202309/orders',
    accessToken: conn.access_token,
    shopCipher: conn.shop_cipher,
    query: { ids: ids.join(',') },
  })
  return det?.orders || []
}

// ── ADAPTER: JSON cru do TikTok → PEDIDO_NORMALIZADO ─────────────────
// É AQUI que o JSON real do sandbox (Fase 0) fecha os nomes de campo.
// Cada campo incerto tem candidatos em ordem; o primeiro presente vence.

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function soDigitos(s: any): string {
  return String(s ?? '').replace(/\D/g, '')
}

export function adaptarPedido(raw: any): PedidoNormalizado {
  const end = raw?.recipient_address || {}

  // TODO Fase 0 (§0.2 — ITEM CRÍTICO): campo do CPF/CNPJ do comprador
  // no mercado BR. Candidatos em ordem de probabilidade:
  const cpfCnpj = soDigitos(
    raw?.buyer_tax_id ??
    end?.tax_id ??
    raw?.buyer_info?.tax_id ??
    raw?.buyer_info?.cpf ??
    '')

  // TODO Fase 0 (§0.2): flags de amostra/presente no pedido BR
  let tipo: PedidoNormalizado['tipo'] = 'venda'
  if (raw?.is_sample_order === true) tipo = 'amostra'
  else if (raw?.is_gift === true || raw?.has_gift === true) tipo = 'presente'

  // district_info: lista de níveis (estado/cidade/bairro). No BR o
  // nível "state"/L1 é a UF e "city"/L2 o município.
  const niveis: any[] = end?.district_info || []
  const nivel = (tipos: string[]) =>
    niveis.find(n => tipos.includes(
      String(n?.address_level_name || n?.address_level || '')
        .toLowerCase()))?.address_name || ''
  const uf = String(end?.state || nivel(['state', 'l1', 'province']))
    .toUpperCase().slice(0, 2)
  const municipio = end?.city || nivel(['city', 'l2', 'municipality'])
  const bairro = end?.district || nivel(['district', 'l3', 'neighborhood'])

  const itens = (raw?.line_items || raw?.item_list || []).map((it: any) => ({
    seller_sku:     String(it?.seller_sku ?? it?.sku ?? ''),
    descricao:      String(it?.product_name ?? it?.name ?? ''),
    quantidade:     num(it?.quantity ?? 1) || 1,
    valor_unitario: num(it?.sale_price ?? it?.original_price ?? it?.price),
    desconto:       num(it?.seller_discount ?? it?.discount ?? 0),
  }))

  const pag = raw?.payment || raw?.payment_info || {}
  return {
    order_id: String(raw?.id ?? raw?.order_id ?? ''),
    criado_em: raw?.create_time
      ? new Date(num(raw.create_time) * 1000).toISOString()
      : new Date().toISOString(),
    status: String(raw?.status ?? raw?.order_status ?? ''),
    tipo,
    comprador: {
      nome: String(end?.name ?? raw?.buyer_info?.name ?? ''),
      cpf_cnpj: cpfCnpj,
      email: String(raw?.buyer_email ?? ''),
    },
    endereco: {
      logradouro: String(end?.address_line1 ?? end?.full_address ?? ''),
      numero:     String(end?.address_line2 ?? ''),
      complemento: String(end?.address_line3 ?? ''),
      bairro,
      municipio: String(municipio),
      uf,
      cep: soDigitos(end?.postal_code ?? end?.zipcode),
      telefone: soDigitos(end?.phone_number ?? end?.phone),
      // Backend pode resolver o IBGE aqui no futuro; por ora o app
      // desktop resolve via services/ibge com fallback manual.
    },
    itens,
    frete: num(pag?.shipping_fee ?? pag?.original_shipping_fee),
    desconto_pedido: num(pag?.platform_discount) + num(pag?.seller_discount),
  }
}

// ── Envio da NF-e de volta (libera etiqueta) ─────────────────────────
// TODO Fase 0 (§0.3): endpoint BR real vai em TIKTOK_INVOICE_PATH.
// O corpo abaixo é um chute razoável — ajustar quando a doc BR chegar.

export async function enviarNfeTikTok(
  conn: { access_token: string; shop_cipher: string },
  orderId: string, chaveAcesso: string, xml: string,
): Promise<any> {
  const path = cfg.invoicePath()
  if (!path) {
    throw new Error(
      'TIKTOK_INVOICE_PATH não configurado — endpoint BR de NF-e ' +
      'pendente da verificação Fase 0 (VERIFICACAO-TIKTOK.md §0.3).')
  }
  return chamarTikTok({
    method: 'POST', path,
    accessToken: conn.access_token, shopCipher: conn.shop_cipher,
    body: {
      order_id: orderId,
      access_key: chaveAcesso,
      xml_base64: Buffer.from(xml, 'utf-8').toString('base64'),
    },
  })
}

// ── Modo MOCK: pedidos de demonstração ───────────────────────────────
// Mesmo formato do _dev/pedido_tiktok_exemplo.json do desktop.

export function pedidosMock(): PedidoNormalizado[] {
  const agora = new Date().toISOString()
  return [
    {
      order_id: '579912345678901234',
      criado_em: agora,
      status: 'AGUARDANDO_ENVIO',
      tipo: 'venda',
      comprador: { nome: 'Maria da Silva Teste', cpf_cnpj: '12345678909' },
      endereco: {
        logradouro: 'Av Paulista', numero: '1000', complemento: 'ap 12',
        bairro: 'Bela Vista', municipio: 'Sao Paulo', uf: 'SP',
        cep: '01310100', telefone: '11999998888',
        codigo_municipio_ibge: '3550308',
      },
      itens: [{ seller_sku: 'CAM-001',
                descricao: 'Camiseta basica preta M',
                quantidade: 2, valor_unitario: 49.9, desconto: 0 }],
      frete: 12.5,
      desconto_pedido: 5,
    },
    {
      order_id: '579998765432109876',
      criado_em: agora,
      status: 'AGUARDANDO_ENVIO',
      tipo: 'amostra',
      comprador: { nome: 'Joao Criador de Conteudo', cpf_cnpj: '12345678909' },
      endereco: {
        logradouro: 'Rua Augusta', numero: '500', complemento: '',
        bairro: 'Consolacao', municipio: 'Sao Paulo', uf: 'SP',
        cep: '01305000', telefone: '11988887777',
        codigo_municipio_ibge: '3550308',
      },
      itens: [{ seller_sku: 'CAM-001',
                descricao: 'Camiseta basica preta M',
                quantidade: 1, valor_unitario: 49.9, desconto: 0 }],
      frete: 0,
      desconto_pedido: 0,
    },
  ]
}
