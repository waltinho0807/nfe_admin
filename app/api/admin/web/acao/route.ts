// ============================================================================
//  app/api/admin/web/acao/route.ts — as duas acoes de escrita.
//
//  So duas, de proposito: dar/tirar vitalicio e mexer no vencimento.
//
//  Reset de senha e exclusao de conta ficaram de fora. Sao as unicas cujo
//  estrago nao volta atras, e as unicas que um invasor usaria para tomar a
//  conta de um cliente. Enquanto o painel tiver uma senha unica e nenhum
//  segundo fator, o custo de erra-las e maior que a comodidade.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { verificarAdmin, unauthorized } from '@/lib/auth'
import { web, webConfigurado } from '@/lib/webdb'

export const dynamic = 'force-dynamic'

type Acao = 'vitalicio' | 'remover_vitalicio' | 'estender' | 'definir_vencimento'

export async function POST(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  if (!webConfigurado()) {
    return NextResponse.json({ error: 'WEB_MONGODB_URI nao configurada.' },
                             { status: 503 })
  }

  try {
    const { userId, acao, dias, data } = await req.json() as {
      userId: number; acao: Acao; dias?: number; data?: string
    }
    if (!userId || !acao) {
      return NextResponse.json({ error: 'Informe userId e acao.' }, { status: 400 })
    }

    const { User, Auditoria } = await web()
    const antes = await User.findOne({ id: userId })
      .select('subscriptionStatus subscriptionExpiresAt username -_id').lean()
    if (!antes) {
      return NextResponse.json({ error: 'Conta nao encontrada.' }, { status: 404 })
    }

    const set: any = {}

    switch (acao) {
      case 'vitalicio':
        set.subscriptionStatus = 'vitalicio'
        // Vitalicio nao expira: deixar data velha para tras faria a tela
        // do cliente mostrar um vencimento que nao vale.
        set.subscriptionExpiresAt = null
        break

      case 'remover_vitalicio':
        // Sem data, volta como inativo — nao como assinante. Marcar
        // assinante aqui daria acesso pago sem cobranca nenhuma.
        set.subscriptionStatus = (antes as any).subscriptionExpiresAt
          ? 'assinante' : 'inactive'
        break

      case 'estender': {
        const n = Number(dias)
        if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 3650) {
          return NextResponse.json({ error: 'dias invalido.' }, { status: 400 })
        }
        // Soma ao que resta, igual ao webhook do Asaas. Partir de hoje
        // quando ainda ha prazo tiraria dias que a pessoa ja pagou.
        const atual = (antes as any).subscriptionExpiresAt
          ? new Date((antes as any).subscriptionExpiresAt) : null
        const base = atual && atual > new Date() ? atual : new Date()
        set.subscriptionExpiresAt = new Date(base.getTime() + n * 86_400_000)
        if ((antes as any).subscriptionStatus === 'inactive'
            || (antes as any).subscriptionStatus === 'expirado') {
          set.subscriptionStatus = 'assinante'
        }
        break
      }

      case 'definir_vencimento': {
        const d = new Date(String(data))
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: 'data invalida.' }, { status: 400 })
        }
        set.subscriptionExpiresAt = d
        break
      }

      default:
        return NextResponse.json({ error: 'acao desconhecida.' }, { status: 400 })
    }

    await User.updateOne({ id: userId }, { $set: set })

    // Gravada depois do sucesso e com o antes junto: sem o valor anterior
    // a trilha nao permite desfazer nada.
    await Auditoria.create({
      quem: 'painel-admin', acao, userId,
      antes: {
        subscriptionStatus: (antes as any).subscriptionStatus,
        subscriptionExpiresAt: (antes as any).subscriptionExpiresAt ?? null,
      },
      depois: set,
    })

    return NextResponse.json({ ok: true, aplicado: set })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
