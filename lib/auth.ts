// lib/auth.ts
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET!

export function verificarAdmin(req: NextRequest): boolean {
  const auth  = req.headers.get('authorization') || ''
  const token = auth.replace('Bearer ', '')
  if (!token) return false
  try {
    jwt.verify(token, JWT_SECRET)
    return true
  } catch {
    return false
  }
}

export function unauthorized() {
  return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
}
