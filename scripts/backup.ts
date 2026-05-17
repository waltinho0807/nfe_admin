// scripts/backup.ts
//
// Backup completo do banco de licenças em JSON.
// Útil para guardar fora do Atlas — proteção contra perda de dados.
//
// Uso:
//   npx tsx scripts/backup.ts
//
// Gera arquivo: backups/backup-YYYY-MM-DD.json
//
// RECOMENDAÇÃO: agendar isso para rodar automaticamente
//   - GitHub Actions com cron diário (gratuito)
//   - Vercel Cron Jobs
//   - cron local que sobe pra Drive/S3

import { connectDB, License, Activation, Event } from '../lib/mongodb'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  console.log('Conectando ao MongoDB...')
  await connectDB()

  console.log('Lendo coleções...')
  const [licenses, activations, events] = await Promise.all([
    License.find({}).lean(),
    Activation.find({}).lean(),
    Event.find({}).sort({ created_at: -1 }).limit(10000).lean(),  // últimos 10k eventos
  ])

  console.log(`  Licenças:   ${licenses.length}`)
  console.log(`  Ativações:  ${activations.length}`)
  console.log(`  Eventos:    ${events.length}`)

  const dump = {
    backup_date: new Date().toISOString(),
    counts: {
      licenses: licenses.length,
      activations: activations.length,
      events: events.length,
    },
    licenses,
    activations,
    events,
  }

  // Garante pasta backups/
  const dir = path.join(process.cwd(), 'backups')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  // Nome do arquivo: backup-2026-05-01.json
  const date = new Date().toISOString().slice(0, 10)
  const file = path.join(dir, `backup-${date}.json`)

  fs.writeFileSync(file, JSON.stringify(dump, null, 2))
  const size = (fs.statSync(file).size / 1024).toFixed(1)
  console.log(`\n✓ Backup salvo: ${file} (${size} KB)`)

  // Limpa backups com mais de 30 dias
  const arquivos = fs.readdirSync(dir).filter(f => f.startsWith('backup-'))
  const trinta_dias = 30 * 24 * 60 * 60 * 1000
  let removidos = 0
  for (const arq of arquivos) {
    const stat = fs.statSync(path.join(dir, arq))
    if (Date.now() - stat.mtimeMs > trinta_dias) {
      fs.unlinkSync(path.join(dir, arq))
      removidos++
    }
  }
  if (removidos > 0) {
    console.log(`Removidos ${removidos} backup(s) com mais de 30 dias.`)
  }

  process.exit(0)
}

main().catch(err => {
  console.error('Erro no backup:', err)
  process.exit(1)
})
