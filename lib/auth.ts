// lib/auth.ts
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET!

export function verificarAdmin(req: NextRequest): boolean {
  if (!JWT_SECRET) return false

  const auth  = req.headers.get('authorization') || ''
  const token = auth.replace('Bearer ', '')
  if (!token) return false

  try {
    // Antes bastava a assinatura conferir. Como o payload nao era olhado,
    // QUALQUER token assinado com este segredo — de licenca, de link de
    // recuperacao, do que fosse — valia como credencial de administrador.
    // Agora o papel precisa estar declarado.
    const payload = jwt.verify(token, JWT_SECRET) as any
    return payload?.role === 'admin'
  } catch {
    return false
  }
}

export function unauthorized() {
  return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
}
