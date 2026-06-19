// scripts/importar-ibpt.ts
//
// Importa as tabelas IBPT (alíquotas de tributos por NCM/UF) pro MongoDB.
// Roda UMA vez por versão da tabela IBPT (a cada ~6 meses, quando o IBPT
// publica uma atualização).
//
// USO:
//   npx tsx scripts/importar-ibpt.ts <pasta_com_csvs>
//
// Os CSVs são os arquivos oficiais TabelaIBPTaxUF<versao>.csv (27 estados).
// Baixados de: deolhonoimposto.ibpt.org.br (cadastro) ou repositório espelho.
//
// IMPORTANTE: substitui a tabela inteira (apaga a antiga, insere a nova).
// Isso garante que ao atualizar, dados antigos não fiquem misturados.

import { connectDB, IbptAliquota, IbptMeta } from '../lib/mongodb'
import * as fs from 'fs'
import * as path from 'path'

const UFS = new Set([
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
])

function detectarUF(nomeArquivo: string): string | null {
  const m = nomeArquivo.match(/TabelaIBPTax([A-Z]{2})/)
  if (m && UFS.has(m[1])) return m[1]
  return null
}

function toNum(s: string): number {
  if (!s || !s.trim()) return 0
  const n = parseFloat(s.trim().replace(',', '.'))
  return isNaN(n) ? 0 : n
}

// Parser de CSV simples (separador ';', sem aspas complexas no IBPT)
function parseCSV(conteudo: string): Record<string, string>[] {
  const linhas = conteudo.split(/\r?\n/).filter(l => l.trim())
  if (linhas.length < 2) return []
  const header = linhas[0].split(';').map(h => h.trim().toLowerCase())
  const out: Record<string, string>[] = []
  for (let i = 1; i < linhas.length; i++) {
    const cols = linhas[i].split(';')
    const row: Record<string, string> = {}
    header.forEach((h, idx) => { row[h] = cols[idx] || '' })
    out.push(row)
  }
  return out
}

async function main() {
  const pasta = process.argv[2]
  if (!pasta) {
    console.error('USO: npx tsx scripts/importar-ibpt.ts <pasta_csvs>')
    process.exit(1)
  }

  const arquivos = fs.readdirSync(pasta).filter(f => /TabelaIBPTax.*\.csv$/i.test(f))
  if (arquivos.length === 0) {
    console.error(`Nenhum CSV encontrado em ${pasta}`)
    process.exit(1)
  }
  console.log(`Encontrados ${arquivos.length} arquivos CSV.`)

  console.log('Conectando ao MongoDB...')
  await connectDB()

  // Limpa a tabela antiga (substituição completa)
  console.log('Limpando tabela IBPT antiga...')
  await IbptAliquota.deleteMany({})

  let totalGeral = 0
  let versao = '', vigIni = '', vigFim = ''
  const ufsImportadas: string[] = []

  for (const arq of arquivos.sort()) {
    const uf = detectarUF(arq)
    if (!uf) {
      console.log(`  ⚠ pulando (UF não detectada): ${arq}`)
      continue
    }

    // Encoding latin-1 (ISO-8859-1) — padrão dos arquivos IBPT
    const buf = fs.readFileSync(path.join(pasta, arq))
    const conteudo = buf.toString('latin1')
    const rows = parseCSV(conteudo)

    const docs: any[] = []
    for (const row of rows) {
      // Só NCM (tipo 0). Pula serviços (NBS).
      if ((row['tipo'] || '0').trim() !== '0') continue
      const ncm = (row['codigo'] || '').trim()
      if (!ncm) continue

      docs.push({
        uf,
        ncm,
        ex: (row['ex'] || '').trim(),
        descricao: (row['descricao'] || '').trim(),
        nacional_federal:  toNum(row['nacionalfederal']),
        importado_federal: toNum(row['importadosfederal']),
        estadual:          toNum(row['estadual']),
        municipal:         toNum(row['municipal']),
        vigencia_inicio:   (row['vigenciainicio'] || '').trim(),
        vigencia_fim:      (row['vigenciafim'] || '').trim(),
        versao:            (row['versao'] || '').trim(),
      })

      if (!versao && row['versao']) {
        versao = row['versao'].trim()
        vigIni = (row['vigenciainicio'] || '').trim()
        vigFim = (row['vigenciafim'] || '').trim()
      }
    }

    // Insere em lotes (insertMany é rápido)
    if (docs.length > 0) {
      await IbptAliquota.insertMany(docs, { ordered: false })
      totalGeral += docs.length
      ufsImportadas.push(uf)
      console.log(`  ✓ ${uf}: ${docs.length} NCMs`)
    }
  }

  // Atualiza metadados
  console.log('Gravando metadados...')
  const metaUpserts = [
    { chave: 'versao', valor: versao },
    { chave: 'vigencia_inicio', valor: vigIni },
    { chave: 'vigencia_fim', valor: vigFim },
    { chave: 'ufs', valor: ufsImportadas.sort().join(',') },
    { chave: 'fonte', valor: 'IBPT' },
  ]
  for (const m of metaUpserts) {
    await IbptMeta.updateOne({ chave: m.chave }, { valor: m.valor }, { upsert: true })
  }

  console.log('')
  console.log('═══ Importação concluída ═══')
  console.log(`  Estados:    ${ufsImportadas.length}`)
  console.log(`  Total NCMs: ${totalGeral}`)
  console.log(`  Versão:     ${versao}`)
  console.log(`  Vigência:   ${vigIni} a ${vigFim}`)

  process.exit(0)
}

main().catch(err => {
  console.error('Erro na importação:', err)
  process.exit(1)
})
