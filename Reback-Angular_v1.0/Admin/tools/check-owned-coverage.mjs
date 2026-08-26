import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const minimumCoverage = 80
const baselineCommit = '1193545fed6ffa76734e7750723c03f49062945d'
const ownedFiles = [
  'src/app/core/services/testlab.service.ts',
  'src/app/views/test/test-plan.component.ts',
  'src/app/views/test/spec-items-explorer/spec-items-explorer.component.ts',
]

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = path.resolve(projectRoot, '..', '..')
const frontendPrefix = 'Reback-Angular_v1.0/Admin/'

function changedLines(file) {
  const repositoryPath = `${frontendPrefix}${file}`
  const diff = execFileSync(
    'git',
    ['diff', '--unified=0', baselineCommit, '--', repositoryPath],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )

  const lines = new Set()
  for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1])
    const count = match[2] === undefined ? 1 : Number(match[2])
    for (let line = start; line < start + count; line += 1) lines.add(line)
  }
  return lines
}

function parseLcov() {
  const lcovPath = path.join(projectRoot, 'coverage', 'owned', 'lcov.info')
  const records = new Map()
  let currentFile = ''

  for (const line of readFileSync(lcovPath, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      const absolute = path.resolve(line.slice(3))
      currentFile = path.relative(projectRoot, absolute).replaceAll('\\', '/')
      records.set(currentFile, new Map())
    } else if (currentFile && line.startsWith('DA:')) {
      const [lineNumber, hits] = line.slice(3).split(',').map(Number)
      records.get(currentFile).set(lineNumber, hits)
    } else if (line === 'end_of_record') {
      currentFile = ''
    }
  }
  return records
}

const coverage = parseLcov()
let totalExecutable = 0
let totalCovered = 0

console.log('\nOwned frontend changed-line coverage')
for (const file of ownedFiles) {
  const executableLines = coverage.get(file)
  if (!executableLines) throw new Error(`Coverage report is missing owned file: ${file}`)

  const changed = changedLines(file)
  const relevant = [...executableLines].filter(([line]) => changed.has(line))
  const covered = relevant.filter(([, hits]) => hits > 0).length
  const percent = relevant.length ? (covered / relevant.length) * 100 : 100

  totalExecutable += relevant.length
  totalCovered += covered
  console.log(`${file}: ${covered}/${relevant.length} (${percent.toFixed(2)}%)`)
}

const totalPercent = totalExecutable ? (totalCovered / totalExecutable) * 100 : 100
console.log(`Total: ${totalCovered}/${totalExecutable} (${totalPercent.toFixed(2)}%)`)

if (totalPercent < minimumCoverage) {
  console.error(`Owned changed-line coverage must be at least ${minimumCoverage}%.`)
  process.exitCode = 1
}
