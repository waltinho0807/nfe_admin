// app/api/admin/auth/route.ts
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@nfedesktop.com.br'
const ADMIN_PASS  = process.env.ADMIN_PASSWORD || 'trocar-em-producao'
const JWT_SECRET  = process.env.JWT_SECRET!

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASS) {
    return NextResponse.json({ error: 'Credenciais invalidas' }, { status: 401 })
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' })
  return NextResponse.json({ token })
}
