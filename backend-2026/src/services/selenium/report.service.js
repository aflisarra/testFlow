const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')
const mongoose = require('mongoose')

const Project = require('../../models/project.model')
const TestSuite = require('../../models/testsuite')
const TestPlan = require('../../models/testplan.model')
const TestCase = require('../../models/testcase.model')
const TestExecution = require('../../models/TestExecution.model')

const COLORS = {
  blue: '#0A3D91',
  blueDark: '#082F6D',
  orange: '#E67E22',
  white: '#FFFFFF',
  ink: '#172033',
  muted: '#667085',
  line: '#D9E2F2',
  bg: '#F6F8FB',
  panel: '#F1F5FB',
  success: '#15803D',
  danger: '#B42318',
  warning: '#B54708',
  skipped: '#64748B',
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function text(value, fallback = '-') {
  const normalized = String(value == null ? '' : value).trim()
  return normalized || fallback
}

function actorName(actor) {
  if (!actor) return ''
  return text(actor.name || actor.fullName || actor.username || actor.email || '', '')
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text(value)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatDateShort(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text(value)
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date)
}

function formatDuration(seconds) {
  const total = Number(seconds || 0)
  if (!Number.isFinite(total) || total < 0) return '-'
  const minutes = Math.floor(total / 60)
  const secs = Math.round(total % 60)
  if (!minutes) return `${secs}s`
  return `${minutes}m ${String(secs).padStart(2, '0')}s`
}

function statusKind(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'passed' || value === 'success') return 'passed'
  return 'failed'
}

function statusColor(status) {
  const kind = statusKind(status)
  return kind === 'passed' ? COLORS.success : COLORS.danger
}

function statusLabel(status) {
  const kind = statusKind(status)
  return kind === 'passed' ? 'PASSED' : 'FAILED'
}

function getExecutionSteps(execution) {
  return safeArray(execution.stepsResults).length
    ? safeArray(execution.stepsResults)
    : safeArray(execution.stepResults)
}

// Seulement Passed / Failed sont comptabilisés et affichés.
// Skipped / Running / Aborted sont regroupés dans "Failed" pour garder
// un total cohérent, sans catégorie séparée dans le rapport.
function summarizeExecutions(executions, totalCases) {
  const stats = { total: executions.length, passed: 0, failed: 0 }
  for (const execution of executions) {
    if (statusKind(execution.status) === 'passed') stats.passed += 1
    else stats.failed += 1
  }
  const denominator = stats.total || totalCases || 0
  const successRate = denominator ? Math.round((stats.passed / denominator) * 100) : 0
  return { ...stats, successRate }
}

function resolveScreenshotPath(raw) {
  const value = typeof raw === 'string' ? raw : raw?.path || raw?.publicUrl || raw?.url || ''
  const cleaned = String(value || '').trim()
  if (!cleaned) return ''
  if (path.isAbsolute(cleaned) && fs.existsSync(cleaned)) return cleaned

  const fileName = cleaned.split(/[\\/]/).pop()
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', cleaned.replace(/^\/+/, '')),
    path.resolve(__dirname, '..', '..', '..', 'uploads', 'screenshots', fileName || ''),
    path.resolve(__dirname, '..', '..', 'uploads', 'screenshots', fileName || ''),
    path.resolve(__dirname, '..', '..', '..', 'src', 'uploads', 'screenshots', fileName || ''),
  ]
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || ''
}

function collectScreenshots(execution) {
  const fromExecution = safeArray(execution.screenshots)
  const fromSteps = getExecutionSteps(execution)
    .map((step) => step.screenshot || step.screenshotPath)
    .filter(Boolean)
  return [...fromExecution, ...fromSteps]
    .map(resolveScreenshotPath)
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index)
}

function extractAiAnalysis(execution) {
  const candidates = [
    execution.aiAnalysis,
    execution.aiFailureAnalysis,
    execution.failureAnalysis,
    execution.executionModel?.aiAnalysis,
    execution.executionModel?.failureAnalysis,
  ]
  return candidates.find((item) => item && typeof item === 'object') || null
}

function collectLogs(execution) {
  return safeArray(execution.logs).map((log) => ({
    timestamp: log.timestamp || new Date().toISOString(),
    level: String(log.level || 'INFO').toUpperCase(),
    message: text(log.message, ''),
    data: log.data || {},
  }))
}

async function collectReportData(testSuiteId) {
  const suite = await TestSuite.findById(testSuiteId)
    .populate('projectId', 'title description status ownerId assignedUsers')
    .lean()

  if (!suite) {
    const err = new Error('TestSuite not found')
    err.statusCode = 404
    throw err
  }

  const projectId = String(suite.projectId?._id || suite.projectId || '').trim()
  const project = projectId && mongoose.Types.ObjectId.isValid(projectId)
    ? await Project.findById(projectId)
      .populate('ownerId', 'name email role')
      .populate('assignedUsers', 'name email role picture')
      .lean()
    : null

  const [plans, cases, executions] = await Promise.all([
    TestPlan.find({ testSuiteId }).sort({ createdAt: 1 }).lean(),
    TestCase.find({ testSuiteId }).sort({ createdAt: 1 }).lean(),
    TestExecution.find({ testSuiteId }).sort({ startedAt: -1 }).lean(),
  ])

  const casesByPlanId = new Map()
  for (const testCase of cases) {
    const key = String(testCase.planId || '')
    if (!casesByPlanId.has(key)) casesByPlanId.set(key, [])
    casesByPlanId.get(key).push(testCase)
  }

  return { suite, project, plans, cases, casesByPlanId, executions }
}

class QaReport {
  constructor(data) {
    this.data = data
    this.generatedAt = new Date()
    this.currentSectionTitle = ''
    this.doc = new PDFDocument({
      size: 'A4',
      margin: 42,
      bufferPages: true,
      autoFirstPage: false,
      compress: true,
    })
  }

  render() {
    return new Promise((resolve, reject) => {
      const chunks = []
      this.doc.on('data', (chunk) => chunks.push(chunk))
      this.doc.on('error', reject)
      this.doc.on('end', () => resolve(Buffer.concat(chunks)))

      try {
        this.cover()
        this.summary()
        this.plansAndCases()
        this.executionDetails()
        this.finalizeFooters()
        this.doc.end()
      } catch (error) {
        reject(error)
        try {
          this.doc.end()
        } catch {
          // ignore double-end errors
        }
      }
    })
  }

addPage(title = '') {
  if (title) this.currentSectionTitle = title
  this.doc.addPage()
  this.header(this.currentSectionTitle)
}

  header(title) {
    const { doc } = this
    doc.save()
    doc.rect(0, 0, doc.page.width, 66).fill(COLORS.blue)
    doc.rect(0, 58, doc.page.width, 8).fill(COLORS.orange)
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(12).text('QA Execution History Report', 42, 22)
    doc.fillColor(COLORS.white).font('Helvetica').fontSize(9.5).text(title || 'Executive Summary', 42, 40)
    doc.restore()
    doc.x = 42
    doc.y = 84
  }

 ensure(height = 80) {
  if (this.doc.y + height > this.doc.page.height - 70) this.addPage()
}

  section(title) {
    this.doc.x = 42
    this.ensure(56)
    this.doc.moveDown(0.5)
    this.doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(15).text(title, 42, this.doc.y)
    this.doc.moveTo(42, this.doc.y + 5).lineTo(553, this.doc.y + 5).strokeColor(COLORS.line).stroke()
    this.doc.x = 42
    this.doc.moveDown(1.0)
  }

  // Fond du badge dessiné avec fillOpacity() (au lieu d'un hex à 8 caractères
  // non supporté par PDFKit), qui provoquait un fallback silencieux sur la
  // dernière couleur de remplissage active — d'où le noir dans "Failed" et
  // le rouge résiduel dans "Passed".
  pill(label, color) {
    const { doc } = this
    const x = doc.x
    const y = doc.y
    const w = Math.max(60, doc.widthOfString(label) + 18)

    doc.save()
    doc.fillOpacity(0.14)
    doc.roundedRect(x, y, w, 18, 9).fill(color)
    doc.restore()

    doc.fillColor(color).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x + 9, y + 5)
    doc.x = x + w + 8
    doc.y = y
  }

  metricCard(x, y, w, h, label, value, color) {
    const { doc } = this
    doc.roundedRect(x, y, w, h, 10).fillAndStroke(COLORS.white, COLORS.line)
    doc.rect(x, y, 5, h).fill(color)
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), x + 16, y + 14, { width: w - 24 })
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(20).text(String(value), x + 16, y + 31, { width: w - 24 })
    doc.x = 42
  }

  infoGrid(rows, x, y, labelWidth = 150) {
    const { doc } = this
    let cursor = y
    rows.forEach(([label, value]) => {
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(9).text(label.toUpperCase(), x, cursor)
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(11).text(text(value), x + labelWidth, cursor, { width: 300 })
      cursor += 22
    })
    doc.x = 42
    doc.y = cursor
  }

  table(rows, widths, headers = null) {
    const { doc } = this
    const startX = 42
    const totalWidth = widths.reduce((a, b) => a + b, 0)
    if (headers) {
      this.ensure(28)
      const headerY = doc.y
      doc.rect(startX, headerY, totalWidth, 24).fill(COLORS.blue)
      let x = startX
      headers.forEach((header, index) => {
        doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9).text(header, x + 8, headerY + 7, { width: widths[index] - 16 })
        x += widths[index]
      })
      doc.y = headerY + 24
    }

    rows.forEach((row, rowIndex) => {
      this.ensure(30)
      const y = doc.y
      const height = Math.max(28, ...row.map((cell, index) => doc.heightOfString(text(cell), { width: widths[index] - 16 }) + 14))
      doc.rect(startX, y, totalWidth, height).fill(rowIndex % 2 ? COLORS.white : COLORS.bg)
      let x = startX
      row.forEach((cell, index) => {
        doc.fillColor(index === 0 ? COLORS.ink : COLORS.muted)
          .font(index === 0 ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9.3)
          .text(text(cell), x + 8, y + 8, { width: widths[index] - 16 })
        x += widths[index]
      })
      doc.y = y + height
    })

    // Fix clé : sans ce reset, doc.x reste sur la dernière colonne dessinée
    // et le prochain texte (ex: titre du plan suivant) hérite de cette
    // position au lieu de repartir de la marge gauche.
    doc.x = startX
    doc.moveDown(0.7)
  }

  cover() {
    const { doc, data } = this
    const projectName = text(data.project?.title || data.suite?.nom || 'Project')
    const suiteName = text(data.suite?.nom || data.suite?.nametest || 'Test Suite')
    const testPlanName = text(data.plans[0]?.title || 'Execution History')
    const generatedBy = '-' || text()

    doc.addPage()
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.white)
    doc.rect(0, 0, doc.page.width, 235).fill(COLORS.blue)
    doc.rect(0, 219, doc.page.width, 16).fill(COLORS.orange)

    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(31).text('Execution History', 54, 78)
    doc.fontSize(18).text('Professional QA Report', 54, 118)
    doc.font('Helvetica').fontSize(10.5).text('Generated dynamically from execution evidence, screenshots, logs and AI analysis.', 54, 150, { width: 485 })

    doc.roundedRect(54, 258, 500, 190, 14).fillAndStroke(COLORS.bg, COLORS.line)
    doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(11).text('Report Overview', 74, 276)
    this.infoGrid([
      ['Project Name', projectName],
      ['Test Plan', testPlanName],
      ['Test Suite', suiteName],
      ['Generated At', formatDate(this.generatedAt)],
      ['Generated By', generatedBy],
    ], 74, 308, 122)

    this.doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(23).text(projectName, 54, 485, { width: 500 })
    this.doc.fillColor(COLORS.muted).font('Helvetica').fontSize(12).text(suiteName, 54, 520, { width: 500 })
  }

  summary() {
    const { data } = this
    const totalCases = data.cases.length
    const stats = summarizeExecutions(data.executions, totalCases)
    const firstExecution = data.executions[0] || {}
    const totalDuration = data.executions.reduce((sum, execution) => sum + Number(execution.duration || 0), 0)

    /*this.ensure(120)
    this.section('Executive Summary')*/
    this.currentSectionTitle = 'Executive Summary'
  this.ensure(120)
  this.section('Executive Summary')

    const y = this.doc.y
    this.metricCard(42, y, 118, 72, 'Total Cases', totalCases, COLORS.blue)
    this.metricCard(172, y, 118, 72, 'Passed', stats.passed, COLORS.success)
    this.metricCard(302, y, 118, 72, 'Failed', stats.failed, COLORS.danger)
    this.metricCard(432, y, 118, 72, 'Success Rate', `${stats.successRate}%`, COLORS.orange)
    this.doc.x = 42
    this.doc.y = y + 94

    this.drawStatusChart(stats)

    this.section('Project Context')
    this.table([
      ['Project Name', text(data.project?.title || data.suite?.projectTitle || data.suite?.nom)],
      ['Test Plan', text(data.plans[0]?.title || '-')],
      ['Test Suite', text(data.suite?.nom || data.suite?.nametest)],
      ['Environment', text(firstExecution.environment || 'Staging')],
      ['Browser', text(firstExecution.browser || 'Chrome')],
      ['Execution Date', formatDate(firstExecution.startedAt || data.suite?.executedAt || data.suite?.executionSavedAt)],
      ['Execution Duration', formatDuration(totalDuration)],
    ], [150, 360])

    this.section('Team Information')
    const teamRows = []
    if (data.project?.ownerId) teamRows.push([actorName(data.project.ownerId), text(data.project.ownerId.role || 'Owner')])
    for (const member of safeArray(data.project?.assignedUsers)) {
      teamRows.push([actorName(member), text(member.role || 'Team Member')])
    }
    this.table(teamRows.length ? teamRows : [['Team', 'No members assigned']], [260, 250], ['Member', 'Role'])
  }

  // Uniquement Passed / Failed — Skipped et Running ne sont plus affichés.
  drawStatusChart(stats) {
    const { doc } = this
    const x = 42
    const y = doc.y
    const w = 500
    const h = 18
    const total = Math.max(1, stats.passed + stats.failed)
    const parts = [
      ['Passed', stats.passed, COLORS.success],
      ['Failed', stats.failed, COLORS.danger],
    ]
    let cursor = x
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11).text('Execution Status Distribution', x, y)
    parts.forEach(([, count, color]) => {
      const width = (count / total) * w
      if (width > 0) doc.rect(cursor, y + 24, width, h).fill(color)
      cursor += width
    })
    cursor = x
    parts.forEach(([label, count, color]) => {
      doc.circle(cursor + 4, y + 58, 4).fill(color)
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text(`${label}: ${count}`, cursor + 13, y + 53, { width: 100 })
      cursor += 116
    })
    doc.x = 42
    doc.y = y + 82
  }

  plansAndCases() {
    const { data } = this
    /*this.ensure(120)
    this.section('Test Plans and Test Cases')*/
    this.currentSectionTitle = 'Test Plans'
  this.ensure(120)
  this.section('Test Plans and Test Cases')

    if (!data.plans.length) {
      this.doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10).text('No test plans found for this suite.', 42, this.doc.y)
      return
    }

    data.plans.forEach((plan, index) => {
      this.doc.x = 42

      // Hauteur réellement nécessaire pour le bloc (titre + description +
      // en-tête de tableau + au moins une ligne), calculée avant de
      // dessiner, pour ne jamais couper un plan entre deux pages.
      const titleText = `TP-${index + 1}  ${text(plan.title)}`
      const titleHeight = this.doc.heightOfString(titleText, { width: 500 })
      const descHeight = plan.description
        ? this.doc.heightOfString(plan.description, { width: 500 }) + 4
        : 0
      this.ensure(titleHeight + descHeight + 24 + 28 + 24)

      this.doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(13)
        .text(titleText, 42, this.doc.y, { width: 500 })
      this.doc.x = 42

      if (plan.description) {
        this.doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9.5)
          .text(plan.description, 42, this.doc.y, { width: 500 })
        this.doc.x = 42
      }

      this.doc.moveDown(0.4)

      const cases = data.casesByPlanId.get(String(plan._id)) || []
      this.table(
        cases.length
          ? cases.map((testCase) => [text(testCase.id), text(testCase.title), text(testCase.priority || 'medium')])
          : [['-', 'No test cases linked to this plan', '-']],
        [90, 330, 90],
        ['Case ID', 'Test Case', 'Priority']
      )

      // Espacement net entre chaque plan pour éviter tout chevauchement visuel.
      this.doc.moveDown(0.6)
    })
  }

  executionDetails() {
    const { data } = this
   /*this.ensure(120)
    this.section('Execution History')*/
     this.currentSectionTitle = 'Execution Details'
  this.ensure(120)
  this.section('Execution History')

    if (!data.executions.length) {
      this.doc.fillColor(COLORS.muted).font('Helvetica').fontSize(10).text('No execution history found for this suite.', 42, this.doc.y)
      return
    }

    data.executions.forEach((execution) => {
      this.executionBlock(execution)
    })
  }

  /*executionBlock(execution) {
    this.doc.x = 42
    this.ensure(180)
    const { doc } = this
    const status = statusKind(execution.status)
    const startY = doc.y

    doc.roundedRect(42, startY, 510, 82, 10).fillAndStroke(COLORS.white, COLORS.line)
    doc.rect(42, startY, 5, 82).fill(statusColor(status))
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12).text(text(execution.testCaseTitle || execution.testCaseKey || execution.executionId), 58, startY + 14, { width: 300 })
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text(`Execution ID: ${text(execution.executionId)}`, 58, startY + 34)
    doc.fillColor(COLORS.muted).fontSize(9).text(`Plan: ${text(execution.planTitle || execution.planKey)}`, 58, startY + 50, { width: 290 })
    doc.fillColor(COLORS.muted).fontSize(9).text(`Duration: ${formatDuration(execution.duration)}`, 58, startY + 66)
    doc.x = 444
    doc.y = startY + 16
    this.pill(statusLabel(status), statusColor(status))
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text(formatDate(execution.startedAt), 445, startY + 46, { width: 88, align: 'right' })
    doc.x = 42
    doc.y = startY + 104

    this.table([
      ['Executed By', actorName(execution.executedBy) || actorName(execution.createdBy) || '-'],
      ['Execution Date', formatDate(execution.startedAt)],
      ['Finished At', formatDate(execution.finishedAt)],
      ['Environment', text(execution.environment || 'Staging')],
      ['Browser', text(execution.browser || 'Chrome')],
    ], [140, 370])

    // "Execution Steps" retiré du rapport.
    this.logs(execution)
    this.failedScreenshots(execution)
    this.aiAnalysis(execution)
  }*/

    // Détecte un ObjectId Mongo brut (24 caractères hexadécimaux) pour éviter
  // de l'afficher comme si c'était un nom de plan lisible.
  static isLikelyObjectId(value) {
    return /^[a-f0-9]{24}$/i.test(String(value || '').trim())
  }

  executionBlock(execution) {
    this.doc.x = 42
    const { doc } = this
    const status = statusKind(execution.status)

    const boxX = 42
    const boxWidth = 510
    const titleWidth = 300
    const title = text(execution.testCaseTitle || execution.testCaseKey || execution.executionId)

    const rawPlan = text(execution.planTitle || execution.planKey || '-')
    const planLabel = QaReport.isLikelyObjectId(rawPlan) ? 'Plan ID' : 'Plan'
    const planValue = QaReport.isLikelyObjectId(rawPlan)
      ? `${rawPlan.slice(0, 10)}…${rawPlan.slice(-4)}`
      : rawPlan

    doc.font('Helvetica-Bold').fontSize(12)
    const titleHeight = doc.heightOfString(title, { width: titleWidth })

    const metaLines = [
      `Execution ID: ${text(execution.executionId)}`,
      `${planLabel}: ${planValue}`,
      `Duration: ${formatDuration(execution.duration)}`,
    ]
    const metaLineHeight = 16
    const contentHeight = 14 + titleHeight + 8 + (metaLines.length * metaLineHeight)
    const boxHeight = Math.max(90, contentHeight + 14)

    this.ensure(boxHeight + 20)
    const startY = doc.y

    doc.roundedRect(boxX, startY, boxWidth, boxHeight, 10).fillAndStroke(COLORS.white, COLORS.line)
    doc.rect(boxX, startY, 5, boxHeight).fill(statusColor(status))

    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12)
      .text(title, boxX + 16, startY + 14, { width: titleWidth })

    let metaY = startY + 14 + titleHeight + 8
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
    metaLines.forEach((line) => {
      doc.text(line, boxX + 16, metaY, { width: titleWidth })
      metaY += metaLineHeight
    })

    doc.x = boxX + 402
    doc.y = startY + 16
    this.pill(statusLabel(status), statusColor(status))
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9)
      .text(formatDate(execution.startedAt), boxX + 403, startY + 46, { width: 88, align: 'right' })

    doc.x = 42
    doc.y = startY + boxHeight + 22

    this.table([
      ['Executed By', actorName(execution.executedBy) || actorName(execution.createdBy) || '-'],
      ['Execution Date', formatDate(execution.startedAt)],
      ['Finished At', formatDate(execution.finishedAt)],
      ['Environment', text(execution.environment || 'Staging')],
      ['Browser', text(execution.browser || 'Chrome')],
    ], [140, 370])

    this.logs(execution)
    this.failedScreenshots(execution)
    this.aiAnalysis(execution)
  }

failedScreenshots(execution) {
  const screenshots = collectScreenshots(execution).slice(0, 4)
  if (!screenshots.length) return

  this.section(statusKind(execution.status) === 'failed' ? 'Failed Screenshots' : 'Screenshots')

    const cols = 2
    const gap = 14
    const cardWidth = (510 - gap) / cols
    const imageHeight = 120
    const cardHeight = imageHeight + 26

    screenshots.forEach((filePath, index) => {
      const col = index % cols
      if (col === 0) this.ensure(cardHeight + 12)

      const x = 42 + col * (cardWidth + gap)
      const y = this.doc.y

      this.doc.roundedRect(x, y, cardWidth, cardHeight, 8).fillAndStroke(COLORS.bg, COLORS.line)

      try {
        this.doc.image(filePath, x + 6, y + 6, {
          fit: [cardWidth - 12, imageHeight - 12],
          align: 'center',
          valign: 'center',
        })
      } catch (error) {
        this.doc.fillColor(COLORS.danger).font('Helvetica').fontSize(8)
          .text('Screenshot unavailable', x + 8, y + imageHeight / 2, { width: cardWidth - 16, align: 'center' })
      }

      this.doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5)
        .text(path.basename(filePath), x + 6, y + imageHeight, { width: cardWidth - 12 })

      if (col === cols - 1 || index === screenshots.length - 1) {
        this.doc.x = 42
        this.doc.y = y + cardHeight + 12
      }
    })
  }

  logs(execution) {
    const logs = collectLogs(execution)
    if (!logs.length) return
    this.section('Execution Logs')
    logs.slice(0, 40).forEach((log) => {
      this.ensure(24)
      const isError = String(log.level || '').toUpperCase() === 'ERROR'
      const y = this.doc.y
      this.doc.roundedRect(42, y, 510, 20, 4).fill(isError ? '#FEF3F2' : COLORS.panel)
      this.doc.fillColor(isError ? COLORS.danger : COLORS.blue).font('Helvetica-Bold').fontSize(8).text(text(log.level || 'INFO'), 50, y + 6, { width: 60 })
      this.doc.fillColor(isError ? COLORS.danger : COLORS.ink).font('Helvetica').fontSize(8).text(text(log.message), 108, y + 6, { width: 430 })
      this.doc.y = y + 24
    })
    this.doc.x = 42
  }

  /*failedScreenshots(execution) {
    if (statusKind(execution.status) !== 'failed') return
    const screenshots = collectScreenshots(execution)
    if (!screenshots.length) return
    this.section('Failed Screenshots')
    screenshots.slice(0, 4).forEach((filePath) => {
      this.ensure(190)
      const y = this.doc.y
      try {
        this.doc.image(filePath, 42, y, { fit: [240, 150], align: 'center', valign: 'center' })
        this.doc.rect(42, y, 240, 150).strokeColor(COLORS.line).stroke()
        this.doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(path.basename(filePath), 42, y + 156, { width: 240 })
        this.doc.x = 42
        this.doc.y = y + 178
      } catch (error) {
        this.doc.fillColor(COLORS.danger).font('Helvetica').fontSize(8).text(`Screenshot could not be embedded: ${path.basename(filePath)}`, 42, y)
        this.doc.x = 42
        this.doc.y = y + 18
      }
    })
  }*/

  aiAnalysis(execution) {
    const analysis = extractAiAnalysis(execution)
    if (!analysis) return
    this.section('AI Failure Analysis')
    const rows = [
      ['Root Cause', analysis.rootCause || analysis.description || analysis.title || '-'],
      ['Confidence', analysis.confidence ? `${analysis.confidence}%` : '-'],
      ['Recommended Action', analysis.actionText || analysis.fix || analysis.recommendation || '-'],
    ]
    this.table(rows, [150, 360])
    const recommendations = safeArray(analysis.recommendations)
    if (recommendations.length) {
      this.doc.fillColor(COLORS.orange).font('Helvetica-Bold').fontSize(10).text('Recommendations', 42, this.doc.y)
      this.doc.x = 42
      recommendations.slice(0, 5).forEach((item) => {
        this.doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9).text(`- ${text(item.fix || item.message || item)}`, 42, this.doc.y, { width: 500 })
        this.doc.x = 42
      })
    }
  }

  finalizeFooters() {
    const range = this.doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      this.doc.switchToPage(i)
      const pageNo = i + 1
      this.doc.save()
      this.doc.rect(0, this.doc.page.height - 42, this.doc.page.width, 42).fill(COLORS.white)
      this.doc.moveTo(42, this.doc.page.height - 42).lineTo(553, this.doc.page.height - 42).strokeColor(COLORS.line).stroke()
      this.doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
        .text(`Generated ${formatDateShort(this.generatedAt)}`, 42, this.doc.page.height - 28)
        .text(`Page ${pageNo} of ${range.count}`, 450, this.doc.page.height - 28, { width: 100, align: 'right' })
      this.doc.restore()
    }
  }
}

async function buildTestSuiteReportPdf(testSuiteId) {
  const data = await collectReportData(testSuiteId)
  return new QaReport(data).render()
}

module.exports = {
  buildTestSuiteReportPdf,
}