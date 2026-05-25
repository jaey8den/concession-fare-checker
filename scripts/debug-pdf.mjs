/**
 * debug-pdf.mjs
 * Dumps raw text rows from a SimplyGo PDF so the parser can be debugged.
 * Usage: node scripts/debug-pdf.mjs samples/"SimplyGo Statement_Apr_2026.pdf"
 */

import { readFileSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const workerPath = resolve(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')
const workerUrl = pathToFileURL(workerPath).href

const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs')
GlobalWorkerOptions.workerSrc = workerUrl

const pdfPath = process.argv[2]
if (!pdfPath) {
  console.error('Usage: node scripts/debug-pdf.mjs <path-to-pdf>')
  process.exit(1)
}

const data = new Uint8Array(readFileSync(pdfPath))
const pdf = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise

console.log(`Pages: ${pdf.numPages}\n`)

for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
  console.log(`\n═══ PAGE ${pageNum} ═══`)
  const page = await pdf.getPage(pageNum)
  const content = await page.getTextContent({ includeMarkedContent: false })

  // Collect items with coordinates
  const items = content.items
    .filter(item => item.str && item.str.trim() !== '')
    .map(item => ({ text: item.str, x: Math.round(item.transform[4]), y: Math.round(item.transform[5]) }))

  // Group into rows by Y (±3px tolerance)
  const rows = []
  const sorted = [...items].sort((a, b) => b.y - a.y)
  if (sorted.length === 0) continue

  let currentRow = [sorted[0]]
  let currentY = sorted[0].y

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]
    if (Math.abs(item.y - currentY) <= 3) {
      currentRow.push(item)
    } else {
      rows.push(currentRow.sort((a, b) => a.x - b.x))
      currentRow = [item]
      currentY = item.y
    }
  }
  rows.push(currentRow.sort((a, b) => a.x - b.x))

  for (const row of rows) {
    const cols = row.map(r => `[x${r.x}] "${r.text}"`).join('  |  ')
    console.log(`  y=${row[0].y}: ${cols}`)
  }
}
