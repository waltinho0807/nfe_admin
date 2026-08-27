// ============================================================================
//  app/api/admin/web/parceria/route.ts — concede ou remove parceria.
//
//  Fica aqui, e não no nfe-web, porque o nfe-web atende o público: rota de
//  administração lá seria uma porta a mais exposta na internet. O painel
//  já tem login próprio e já alcança o mesmo banco.
//
//  O código de indicação nasce no momento da concessão. Assim o parceiro
//  encontra o link pronto quando entrar, sem precisar pedir nada.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { verificarAdmin, unauthorized } from '@/lib/auth'
import { web, webConfigurado } from '@/lib/webdb'

export const dynamic = 'force-dynamic'

const FORMATO = /^[A-Z0-9]{4,16}$/

/**
 * Código legível a partir do nome, garantido único.
 *
 * Legível de propósito: o parceiro vai ditar isso em vídeo, e "JOAO10" é
 * falável enquanto um identificador aleatório não é.
 */
async function sugerirCodigo(User: any, nome: string): Promise<string> {
  const base = String(nome ?? 'PARCEIRO')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '')
    .slice(0, 10) || 'PARCEIRO'

  for (let i = 0; i < 50; i++) {
    const tentativa = i === 0 ? base : `${base}${i + 1}`
    if (!FORMATO.test(tentativa)) continue
    if (!(await User.findOne({ 'afiliado.codigo': tentativa }).lean())) return tentativa
  }
  return `${base}${Date.now().toString(36).toUpperCase().slice(-4)}`
}

export async function POST(req: NextRequest) {
  if (!verificarAdmin(req)) return unauthorized()
  if (!webConfigurado()) {
    return NextResponse.json({ error: 'WEB_MONGODB_URI não configurada.' }, { status: 503 })
  }

  try {
    const { userId, tipo, codigo } = await req.json() as {
      userId: number; tipo: string; codigo?: string
    }
    if (!userId || !['user', 'influenciador', 'contador'].includes(tipo)) {
      return NextResponse.json({ error: 'Informe userId e tipo válidos.' }, { status: 400 })
    }

    const { User, Auditoria } = await web()
    const antes = await User.findOne({ id: userId })
      .select('name tipo afiliado -_id').lean() as any
    if (!antes) {
      return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 })
    }

    const set: any = { tipo }

    if (tipo !== 'user') {
      const pedido = String(codigo ?? '').trim().toUpperCase()
      if (pedido) {
        if (!FORMATO.test(pedido)) {
          return NextResponse.json(
            { error: 'Código deve ter 4 a 16 letras ou números.' }, { status: 400 })
        }
        const emUso = await User.findOne({
          'afiliado.codigo': pedido, id: { $ne: userId },
        }).lean()
        if (emUso) {
          return NextResponse.json({ error: 'Esse código já está em uso.' }, { status: 400 })
        }
        set['afiliado.codigo'] = pedido
      } else if (!antes.afiliado?.codigo) {
        set['afiliado.codigo'] = await sugerirCodigo(User, antes.name)
      }
      if (!antes.afiliado?.desde) set['afiliado.desde'] = new Date()
    }
    // Tirar a parceria NÃO apaga o código nem as indicações: o histórico
    // precisa continuar existindo para pagar o que ficou devendo.

    await User.updateOne({ id: userId }, { $set: set })

    await Auditoria.create({
      quem: 'painel-admin', acao: `parceria:${tipo}`, userId,
      antes: { tipo: antes.tipo ?? 'user', codigo: antes.afiliado?.codigo ?? null },
      depois: set,
    })

    const depois = await User.findOne({ id: userId }).select('afiliado tipo -_id').lean() as any
    return NextResponse.json({
      ok: true, tipo, codigo: depois?.afiliado?.codigo ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
