// ============================================================================
//  app/api/admin/web/contas/route.ts — lista de contas do nfe-web.
//
//  Uma chamada devolve os numeros do topo e a lista. Sao poucas contas por
//  enquanto; quando passar de uns milhares, paginar aqui.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { verificarAdmin, unauthorized } from '@/lib/auth'
import { web, webConfigurado } from '@/lib/webdb'

export const dynamic = 'force-dynamic'

/**
 * O que a conta consegue fazer AGORA.
 *
 * O status gravado nao basta: "assinante" com data vencida nao emite mais.
 * Esta e a mesma regra do servidor do nfe-web — se divergir, o painel
 * mente. Mudou la, muda aqui.
 */
function situacao(u: any): string {
  const expira = u.subscriptionExpiresAt ? new Date(u.subscriptionExpiresAt) : null
  const vencida = !!expira && expira <= new Date()

  if (u.subscriptionStatus === 'vitalicio') return 'vitalicio'
  if (u.subscriptionStatus === 'cancelando') return vencida ? 'expirado' : 'cancelando'
  if (u.subscriptionStatus === 'assinante')  return vencida ? 'expirado' : 'assinante'
  if (u.subscriptionStatus === 'pagamento_pendente') return 'pagamento_pendente'
  if (u.subscriptionStatus === 'trial') return vencida ? 'expirado' : 'trial'
  return u.subscriptionStatus || 'inativo'
}

export async function GET(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  if (!webConfigurado()) {
    return NextResponse.json(
      { error: 'WEB_MONGODB_URI nao configurada nesta instalacao.' },
      { status: 503 })
  }

  try {
    const { User, Invoice, Certificate } = await web()

    const users = await User.find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()

    const ids = users.map((u: any) => u.id)

    // Duas agregacoes em vez de duas consultas por conta: com 200 contas a
    // diferenca e entre uma pagina que abre e uma que trava.
    const [porUsuario, certs] = await Promise.all([
      Invoice.aggregate([
        { $match: { userId: { $in: ids } } },
        { $group: {
            _id: '$userId',
            total: { $sum: 1 },
            autorizadas: { $sum: { $cond: [{ $eq: ['$status', 'autorizada'] }, 1, 0] } },
            rejeitadas:  { $sum: { $cond: [{ $eq: ['$status', 'rejeitada'] }, 1, 0] } },
            ultima: { $max: '$createdAt' },
        } },
      ]),
      Certificate.find({ userId: { $in: ids } })
        .select('userId active expiresAt -_id').lean(),
    ])

    const notasDe = new Map<number, any>(
      porUsuario.map((n: any) => [n._id as number, n]))
    const certDe = new Map<number, any>()
    for (const c of certs as any[]) {
      const atual = certDe.get(c.userId)
      // O ativo manda; sem ativo, qualquer um serve para saber que existe.
      if (!atual || c.active) certDe.set(c.userId, c)
    }

    const contas: any[] = users.map((u: any) => {
      const n = notasDe.get(u.id)
      const c = certDe.get(u.id)
      return {
        id: u.id,
        nome: u.name,
        username: u.username,
        email: u.email,
        cnpj: u.cnpj,
        phone: u.phone,
        situacao: situacao(u),
        statusGravado: u.subscriptionStatus,
        expiraEm: u.subscriptionExpiresAt ?? null,
        temCertificado: !!c,
        certificadoVenceEm: c?.expiresAt ?? null,
        notas: n?.total ?? 0,
        autorizadas: n?.autorizadas ?? 0,
        rejeitadas: n?.rejeitadas ?? 0,
        ultimaNota: n?.ultima ?? null,
        veioDeAnuncio: !!u.gclid,
        tipo: u.tipo ?? 'user',
        codigoAfiliado: u.afiliado?.codigo ?? null,
        criadaEm: u.createdAt ?? null,
      }
    })

    const conta = (s: string) => contas.filter((c: any) => c.situacao === s).length
    const pagantes = conta('assinante')

    return NextResponse.json({
      resumo: {
        total: contas.length,
        assinantes: pagantes,
        trial: conta('trial'),
        cancelando: conta('cancelando'),
        expirados: conta('expirado'),
        vitalicios: conta('vitalicio'),
        semCertificado: contas.filter((c: any) => !c.temCertificado).length,
        deAnuncio: contas.filter((c: any) => c.veioDeAnuncio).length,
        parceiros: contas.filter((c: any) => c.tipo !== 'user').length,
        // 9,90 e o preco unico de hoje. Se surgir outro plano, esta conta
        // para de valer e precisa sair do valor do assinante.
        receitaMensal: Number((pagantes * 9.9).toFixed(2)),
      },
      contas,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
