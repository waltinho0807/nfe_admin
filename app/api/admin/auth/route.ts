// app/api/admin/auth/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import jwt from 'jsonwebtoken'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@nfedesktop.com.br'
const ADMIN_PASS  = process.env.ADMIN_PASSWORD
const JWT_SECRET  = process.env.JWT_SECRET!

/** Comparacao de tempo constante — nao vaza o tamanho nem o prefixo. */
function igual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

export async function POST(req: NextRequest) {
  // Havia um fallback embutido: ADMIN_PASSWORD || 'trocar-em-producao'.
  // Sem a variavel setada, o painel abria com uma senha escrita no
  // repositorio. Melhor o painel nao abrir do que abrir para qualquer um.
  if (!ADMIN_PASS || !JWT_SECRET) {
    return NextResponse.json(
      { error: 'Painel nao configurado: defina ADMIN_PASSWORD e JWT_SECRET.' },
      { status: 503 })
  }

  const { email, password } = await req.json()
  if (!igual(String(email ?? ''), ADMIN_EMAIL)
      || !igual(String(password ?? ''), ADMIN_PASS)) {
    return NextResponse.json({ error: 'Credenciais invalidas' }, { status: 401 })
  }

  // O "role" e conferido na entrada de toda rota protegida. Sem ele, um
  // token assinado com o mesmo segredo para outra finalidade valeria como
  // credencial de administrador.
  const token = jwt.sign({ role: 'admin', sub: ADMIN_EMAIL }, JWT_SECRET,
                         { expiresIn: '8h' })
  return NextResponse.json({ token })
}
