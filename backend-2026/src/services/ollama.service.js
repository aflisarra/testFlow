const path = require('path')
const fs = require('fs/promises')
const fsSync = require('fs')
const os = require('os')
const crypto = require('crypto')
const { spawn } = require('child_process')
const axios = require('axios')
const jwt = require('jsonwebtoken')
const FormData = require('form-data')

const TestSuite = require('../models/testsuite')
const TestPlan = require('../models/testplan.model')
const TestCase = require('../models/testcase.model')
const Project = require('../models/project.model')
const User = require('../models/user.model')
const specIngestionService = require('../services/spec-ingestion.service')

const { getJwtSecret } = require('../utils/jwt-secrets')
const {
  hasOwn,
  normalizeRequirements,
  normalizeEvidence,
  normalizeAutomationTestData,
  normalizeString,
  normalizeStringList,
  normalizeTestData,
  validatePriority,
  validateSeverity,
  validateTestCaseType,
} = require('../utils/test-artifact-fields')

function httpError(statusCode, message, code = null) {
  const err = new Error(message || 'Error')
  err.statusCode = Number(statusCode) || 500
  if (code) err.code = code
  return err
}

function getFastApiBaseUrl() {
  const raw = String(process.env.FASTAPI_BASE_URL || '').trim()
  if (!raw) throw httpError(500, 'FASTAPI_BASE_URL is not set')
  return raw.replace(/\/$/, '')
}

function getFastApiHeaders() {
  const secret = String(process.env.FASTAPI_SECRET || '').trim()
  return secret ? { 'X-Internal-Token': secret } : {}
}

function getFastApiTimeoutMs(fallbackMs = 185_000) {
  const raw = String(process.env.FASTAPI_TIMEOUT_MS || process.env.FASTAPI_GENERATION_TIMEOUT_MS || '').trim()
  if (!raw) return fallbackMs

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs
  return Math.floor(parsed)
}

function truncateSpecText(text, maxChars = 800) {
  const str = String(text || '').trim()
  if (str.length <= maxChars) return str
  const cut = str.slice(0, maxChars)
  const lastDot = cut.lastIndexOf('.')
  return lastDot > maxChars / 2 ? cut.slice(0, lastDot + 1) : cut + '...'
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'y', 'on'].includes(value.trim().toLowerCase())
}

function normalizeUniqueTestPlans(rawPlans) {
  const list = Array.isArray(rawPlans) ? rawPlans : []
  const used = new Set()

  return list
    .map((p, idx) => {
      const fallbackId = `TP-${idx + 1}`
      const baseId = String(p?.id || p?.planId || '').trim() || fallbackId

      let nextId = baseId
      let suffix = 2
      while (!nextId || used.has(nextId)) {
        nextId = `${baseId}-${suffix++}`
      }
      used.add(nextId)

      return {
        id: nextId,
        title: String(p?.title || `Test Plan ${idx + 1}`).trim(),
        description: String(p?.description || '').trim(),
        module: normalizeString(p?.module) || null,
        moduleId: normalizeString(p?.module_id ?? p?.moduleId) || null,
        planKind: normalizeString(p?.plan_kind ?? p?.planKind) || 'functional',
        coverageStatus: normalizeString(p?.coverage_status ?? p?.coverageStatus) || 'ready',
        objective: normalizeString(p?.objective),
        scope: normalizeString(p?.scope),
        priority: validatePriority(p?.priority),
        requirements: normalizeRequirements(p?.requirements),
        evidence: normalizeEvidence(p?.evidence),
      }
    })
    .slice(0, 20)
}

function normalizeTestCaseMetadata(testCase = {}) {
  const rawTestData = hasOwn(testCase, 'test_data') ? testCase.test_data : testCase?.testData

  return {
    objective: normalizeString(testCase?.objective),
    preconditions: normalizeStringList(testCase?.preconditions),
    test_data: normalizeAutomationTestData(normalizeTestData(rawTestData)),
    priority: validatePriority(testCase?.priority),
    severity: validateSeverity(testCase?.severity),
    type: validateTestCaseType(testCase?.type),
    requirements: normalizeRequirements(testCase?.requirements),
  }
}

function normalizeStepDetails(value, fallbackSteps = []) {
  const source = Array.isArray(value) ? value : []

  return (source.length ? source : fallbackSteps.map(step => ({ step })))
    .map((item, index) => {
      if (typeof item === 'string') {
        return {
          step: normalizeString(item),
          expected_result: '',
          actual_result: '',
          status: 'pending'
        }
      }

      if (item && typeof item === 'object') {
        const step = normalizeString(
          item.step || item.raw || item.text || item.name || fallbackSteps[index]
        )

        return {
          step: step || `Step ${index + 1}`,

          // ✅ FIX IMPORTANT
          expected_result: normalizeString(
            item.expected_result ??
            item.expectedResult ??
            item.expected ??
            ''
          ),

          actual_result: normalizeString(
            item.actual_result ?? item.actualResult ?? ''
          ),

          status: normalizeString(item.status || 'pending') || 'pending'
        }
      }

      return {
        step: normalizeString(fallbackSteps[index] || `Step ${index + 1}`),
        expected_result: '',
        actual_result: '',
        status: 'pending'
      }
    })
}

function normalizePlanStepsPayload(raw) {
  const list = Array.isArray(raw) ? raw : []
  return list
    .map((s, idx) => {
      if (typeof s === 'string') {
        const contenu = s.trim()
        if (!contenu) return null
        return { contenu, ordre: idx + 1 }
      }
      if (s && typeof s === 'object') {
        const contenu = String(s.contenu ?? s.content ?? s.step ?? '').trim()
        if (!contenu) return null
        const ordre = Number(s.ordre ?? s.order ?? idx + 1)
        return { contenu, ordre: Number.isFinite(ordre) ? ordre : idx + 1 }
      }
      return null
    })
    .filter(Boolean)
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
}

function getUserIdFromAuthHeader(req) {
  const authHeader = String(req?.headers?.authorization || '').trim()
  if (!authHeader.toLowerCase().startsWith('bearer ')) return ''

  const token = authHeader.slice(7).trim()
  if (!token) return ''

  let secret = ''
  try {
    secret = getJwtSecret()
  } catch {
    return ''
  }

  try {
    const decoded = jwt.verify(token, secret)
    const userLike = decoded?.user || decoded
    return String(
      userLike?.userId ||
        userLike?.id ||
        userLike?._id ||
        userLike?.sub ||
        ''
    ).trim()
  } catch {
    return ''
  }
}

function getActorFromReq(req) {
  const raw = req?.user || null
  const id =
    String(raw?.userId || raw?.id || raw?._id || '').trim() ||
    getUserIdFromAuthHeader(req)
  const name = String(raw?.name || raw?.nom || raw?.username || '').trim()
  const picture = String(raw?.picture || raw?.avatar || '').trim()
  return { userId: id || null, name, picture }
}

async function resolveActorName({ userId, name, picture }) {
  if (!userId) return { userId: null, name: '', picture: '' }
  if (name && picture) return { userId, name, picture }

  try {
    const user = await User.findById(userId).select('_id name nom picture').lean()
    const resolvedName = String(user?.name || user?.nom || '').trim() || String(name || '').trim()
    const resolvedPicture = String(user?.picture || '').trim() || String(picture || '').trim()
    return { userId, name: resolvedName, picture: resolvedPicture }
  } catch {
    return {
      userId,
      name: String(name || '').trim(),
      picture: String(picture || '').trim(),
    }
  }
}

async function dualWriteTestPlans({ testSuiteId, testPlans }) {
  const plans = Array.isArray(testPlans) ? testPlans : []
  if (!testSuiteId || plans.length === 0) return

  const ops = plans
    .map((p) => {
      const id = String(p?.id || '').trim()
      if (!id) return null

      return {
        updateOne: {
          filter: { testSuiteId, id },
          update: {
            $set: {
              testSuiteId,
              id,
              title: String(p?.title || '').trim() || id,
              description: String(p?.description || '').trim(),
              objective: normalizeString(p?.objective),
              scope: normalizeString(p?.scope),
              module: normalizeString(p?.module) || null,
              moduleId: normalizeString(p?.moduleId) || null,
              planKind: normalizeString(p?.planKind) || 'functional',
              coverageStatus: normalizeString(p?.coverageStatus) || 'ready',
              priority: validatePriority(p?.priority),
              requirements: normalizeRequirements(p?.requirements),
              evidence: normalizeEvidence(p?.evidence),
            },
          },
          upsert: true,
        },
      }
    })
    .filter(Boolean)

  if (ops.length) await TestPlan.bulkWrite(ops, { ordered: false })
}

async function dualWriteTestCases({ testSuiteId, planKey, planTitle, planData, testCases }) {
  const stablePlanId = String(planKey || '').trim()
  const list = Array.isArray(testCases) ? testCases : []
  if (!testSuiteId || !stablePlanId || list.length === 0) return

  let plan = await TestPlan.findOne({ testSuiteId, id: stablePlanId }).select('_id').lean()
  if (!plan) {
    plan = await TestPlan.create({
      testSuiteId,
      id: stablePlanId,
      title: String(planTitle || stablePlanId).trim(),
      description: normalizeString(planData?.description),
      module: normalizeString(planData?.module) || null,
      moduleId: normalizeString(planData?.moduleId) || null,
      planKind: normalizeString(planData?.planKind) || 'functional',
      coverageStatus: normalizeString(planData?.coverageStatus) || 'ready',
      // ✅ métadonnées préservées
      objective: normalizeString(planData?.objective),
      scope: normalizeString(planData?.scope),
      priority: validatePriority(planData?.priority),
      requirements: normalizeRequirements(planData?.requirements || []),
      evidence: normalizeEvidence(planData?.evidence || []),
    })
  }

  const mongoPlanId = plan?._id || null
  if (!mongoPlanId) return

  const ops = list
    .map((tc) => {
      const id = String(tc?.id || '').trim()
      if (!id) return null

      // ✅ Fix test_data — ne pas écraser si absent
      const meta = normalizeTestCaseMetadata(tc)
      const hasTestData = hasOwn(tc, 'test_data') || hasOwn(tc, 'testData')
      if (!hasTestData) delete meta.test_data
      const hasStepDetails = hasOwn(tc, 'stepDetails') || hasOwn(tc, 'step_details')
      const normalizedStepDetails = normalizeStepDetails(
        hasStepDetails ? (tc.stepDetails || tc.step_details) : [],
        Array.isArray(tc?.steps) ? tc.steps : []
      )

      return {
        updateOne: {
          filter: { testSuiteId, planId: mongoPlanId, id },
          update: {
            $set: {
              testSuiteId,
              planId: mongoPlanId,
              id,
              title: String(tc?.title || '').trim() || id,
              ...meta,
              steps: Array.isArray(tc?.steps)
                ? tc.steps.map((s) => String(s || '').trim()).filter(Boolean)
                : [],
              expected_result: String(tc?.expected_result || tc?.expectedResult || '').trim(),
              stepDetails: normalizedStepDetails,
              executionModel: tc?.executionModel || tc?.execution_model || null,
              createdBy: tc?.createdBy
                ? {
                    userId: tc.createdBy.userId || null,
                    name: String(tc.createdBy.name || '').trim(),
                    picture: String(tc.createdBy.picture || '').trim(),
                  }
                : null,
            },
          },
          upsert: true,
        },
      }
    })
    .filter(Boolean)

  if (!ops.length) return

  const result = await TestCase.bulkWrite(ops, { ordered: false })
  console.log('[dualWriteTestCases] saved cases', {
    testSuiteId: String(testSuiteId),
    planKey: stablePlanId,
    planMongoId: String(mongoPlanId),
    matchedCount: result?.matchedCount || 0,
    modifiedCount: result?.modifiedCount || 0,
    upsertedCount: result?.upsertedCount || 0,
  })
  return result
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true }
    )

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += String(d)))
    child.stderr.on('data', (d) => (stderr += String(d)))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr })
      const error = new Error(stderr || stdout || `PowerShell exited with code ${code}`)
      error.code = code
      reject(error)
    })
  })
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

function extractTextFromDocumentXml(xml) {
  const source = String(xml || '')
    .replaceAll(/<w:tab[^>]*\/>/g, '\t')
    .replaceAll(/<w:br[^>]*\/>/g, '\n')

  const paragraphs = source.match(/<w:p[\s\S]*?<\/w:p>/g) || []
  const lines = paragraphs.map((p) => {
    const parts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) =>
      decodeXmlEntities(m[1])
    )
    return parts.join('').trimEnd()
  })

  return lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractDocxText(buffer) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'docx-'))
  // Expand-Archive refuses unknown extensions like .docx even if it's a ZIP internally,
  // so we write the buffer as .zip for PowerShell.
  const zipPath = path.join(tempRoot, 'spec.zip')
  const unzipDir = path.join(tempRoot, 'unzipped')

  try {
    await fs.writeFile(zipPath, buffer)

    if (process.platform !== 'win32') {
      throw httpError(
        400,
        'DOCX extraction requires Windows PowerShell Expand-Archive (current platform not supported).'
      )
    }

    await fs.mkdir(unzipDir, { recursive: true })
    const cmd = `Expand-Archive -Path '${zipPath.replaceAll("'", "''")}' -DestinationPath '${unzipDir.replaceAll(
      "'",
      "''"
    )}' -Force`
    await runPowerShell(cmd)

    const documentXmlPath = path.join(unzipDir, 'word', 'document.xml')
    const xml = await fs.readFile(documentXmlPath, 'utf8')
    return extractTextFromDocumentXml(xml)
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
  }
}

async function readSpecTextFromUpload(file) {
  if (!file) throw httpError(400, 'file (.docx/.md/.txt) is required')

  const fileBuffer = file?.buffer || (file?.path ? await fs.readFile(file.path) : null)
  if (!fileBuffer) throw httpError(400, 'file (.docx/.md/.txt) is required')

  const ext = path.extname(String(file?.originalname || '')).toLowerCase()
  if (ext === '.docx') {
    const specText = await extractDocxText(fileBuffer)
    if (!specText) throw httpError(400, 'Unable to extract text from .docx')
    // Persist a copy for debugging and log a preview
    try {
      await fs.mkdir(path.join(process.cwd(), 'uploads', 'spec_texts'), { recursive: true })
      const safeName = (file.originalname || 'upload').replace(/[^a-zA-Z0-9.-]/g, '_')
      const outPath = path.join(process.cwd(), 'uploads', 'spec_texts', `${Date.now()}_${safeName}.txt`)
      await fs.writeFile(outPath, specText, 'utf8')
      console.log('Spec extracted and saved to:', outPath)
      console.log('Spec preview:', String(specText).slice(0, 800).replace(/\n/g, ' '))
    } catch (e) {
      console.warn('Failed to persist spec text for debugging:', e?.message || e)
    }
    return specText
  }

  const specText = String(Buffer.from(fileBuffer).toString('utf8') || '').trim()
  if (!specText) throw httpError(400, 'Unable to read text from file')
  // Persist and log for non-docx text files
  try {
    await fs.mkdir(path.join(process.cwd(), 'uploads', 'spec_texts'), { recursive: true })
    const safeName = (file.originalname || 'upload').replace(/[^a-zA-Z0-9.-]/g, '_')
    const outPath = path.join(process.cwd(), 'uploads', 'spec_texts', `${Date.now()}_${safeName}.txt`)
    await fs.writeFile(outPath, specText, 'utf8')
    console.log('Spec extracted and saved to:', outPath)
    console.log('Spec preview:', String(specText).slice(0, 800).replace(/\n/g, ' '))
  } catch (e) {
    console.warn('Failed to persist spec text for debugging:', e?.message || e)
  }
  return specText
}

async function uploadSpecToFastApi(file, ingestionScope) {
  const filename = String(file?.originalname || '').trim()
  if (path.extname(filename).toLowerCase() !== '.docx') {
    throw httpError(400, 'Role-tagging ingestion currently requires a .docx specification.')
  }

  const form = new FormData()
  if (file?.path) {
    form.append('file', fsSync.createReadStream(file.path), { filename })
  } else if (file?.buffer) {
    form.append('file', file.buffer, { filename })
  } else {
    throw httpError(400, 'Specification file data is missing.')
  }
  form.append('ingestion_scope', String(ingestionScope || '').trim())

  const response = await axios.post(`${getFastApiBaseUrl()}/upload-spec`, form, {
    timeout: getFastApiTimeoutMs(420_000),
    headers: { ...form.getHeaders(), ...getFastApiHeaders() },
  })
  const specHash = String(response?.data?.spec_hash || '').trim().toLowerCase()
  const sourceSpecHash = String(response?.data?.source_spec_hash || '').trim().toLowerCase()
  const specText = String(response?.data?.spec_text || '').trim()
  if (!/^[a-f0-9]{64}$/.test(specHash) || !/^[a-f0-9]{64}$/.test(sourceSpecHash) || !specText) {
    throw httpError(502, 'FastAPI upload did not return a valid spec_hash and spec_text.')
  }
  return { specHash, sourceSpecHash, specText }
}

function specNotIngestedError() {
  return httpError(
    409,
    'This test suite was generated before role tagging was introduced. Re-upload the original specification.',
    'SPEC_NOT_INGESTED'
  )
}

async function ingestSpecification({ req, body, file, testSuiteId = '' }) {
  if (!file) throw httpError(400, 'file (.docx) is required')
  const projectId = String(body?.projectId || '').trim()
  const suiteName = String(body?.nom || body?.name || '').trim()
  const testName = String(body?.nametest || body?.nameTest || '').trim()
  const urlCible = String(body?.urlCible || body?.applicationUrl || '').trim()
  const styleConfig = String(body?.styleConfig || body?.style_config || '').trim()
  const userId = String(req?.user?.userId || req?.user?.id || req?.user?._id || getUserIdFromAuthHeader(req)).trim()

  let suite = null
  if (testSuiteId) {
    suite = await TestSuite.findById(testSuiteId)
    if (!suite) throw httpError(404, 'TestSuite not found')
  } else {
    if (!userId) throw httpError(401, 'Authenticated user is required')
    if (!projectId) throw httpError(400, 'projectId is required')
    const project = await Project.findById(projectId).select('_id').lean()
    if (!project) throw httpError(404, 'Project not found', 'PROJECT_NOT_FOUND')
  }

  const ingestionScope = String(suite?.ingestionScope || '').trim() || crypto.randomUUID()
  const uploadedSpec = await uploadSpecToFastApi(file, ingestionScope)
  const specText = uploadedSpec.specText
  const description = [styleConfig, '', '---- SPEC EXTRACT ----', specText].join('\n').trim().slice(0, 20_000)
  const payload = {
    description,
    urlCible,
    specText: specText.slice(0, 50_000),
    styleConfig,
    specHash: uploadedSpec.specHash,
    sourceSpecHash: uploadedSpec.sourceSpecHash,
    ingestionScope,
    specFileName: file.originalname || null,
    specFilePath: file.filename ? `uploads/specs/${file.filename}` : null,
  }

  if (suite) {
    if (suiteName) payload.nom = suiteName
    if (testName) payload.nametest = testName
    if (projectId) payload.projectId = projectId
    suite = await TestSuite.findByIdAndUpdate(suite._id, payload, { new: true, runValidators: true })
  } else {
    const now = new Date()
    const defaultName = `Test Suite - ${now.toISOString().slice(0, 19).replace('T', ' ')}`
    suite = await TestSuite.create({
      ...payload,
      nom: suiteName || defaultName,
      nametest: testName || suiteName || defaultName,
      userId,
      projectId,
    })
  }

  const pendingReviewCount = await specIngestionService.countPendingReview(uploadedSpec.specHash)
  return {
    testSuiteId: String(suite._id),
    pendingReviewCount: Number(pendingReviewCount || 0),
  }
}

async function generatePlanForSuite({ req, testSuiteId, body }) {
  return generatePlan({ req, body: { ...(body || {}), testSuiteId }, file: null })
}

async function fastApiHealth() {
  const baseUrl = getFastApiBaseUrl()
  const response = await axios.get(`${baseUrl}/`, { timeout: 10_000, headers: getFastApiHeaders() })
  return response.data
}

async function fastApiChat(message) {
  const baseUrl = getFastApiBaseUrl()
  const response = await axios.post(
    `${baseUrl}/chat`,
    { message },
    { timeout: 120_000, headers: getFastApiHeaders() }
  )
  return { reply: response?.data?.reply }
}

async function cancelGeneration(payload) {
  const baseUrl = getFastApiBaseUrl()
  const body = payload && typeof payload === 'object' ? payload : {}
  const response = await axios.post(`${baseUrl}/cancel-generation`, body, {
    timeout: 15_000,
    headers: getFastApiHeaders(),
  })
  return response?.data || { message: 'Cancellation requested.' }
}

async function getTestsuitePlan(testSuiteId) {
  const id = String(testSuiteId || '').trim()
  if (!id) throw httpError(400, 'testSuiteId is required')

  const suite = await TestSuite.findById(id)
  if (!suite) throw httpError(404, 'TestSuite not found')

  if (Array.isArray(suite.planSteps) && suite.planSteps.length) {
    const plans = [...suite.planSteps]
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
      .map((p) => ({
        _id: p._id,
        contenu: p.contenu,
        ordre: p.ordre,
        testSuiteId: id,
      }))
    return { plans, steps: plans.map((p) => p.contenu) }
  }

  return { plans: [], steps: [] }
}

async function getTestsuiteTestPlans(testSuiteId) {
  const id = String(testSuiteId || '').trim()
  if (!id) throw httpError(400, 'testSuiteId is required')

  const suite = await TestSuite.findById(id).lean()
  if (!suite) throw httpError(404, 'TestSuite not found')

  const plans = await TestPlan.find({ testSuiteId: id }).sort({ createdAt: 1 }).lean()
  const cases = await TestCase.find({ testSuiteId: id }).sort({ createdAt: 1 }).lean()
  const casesByPlanId = new Map()

  for (const testCase of cases) {
    const key = String(testCase.planId || '')
    if (!casesByPlanId.has(key)) casesByPlanId.set(key, [])
    casesByPlanId.get(key).push(testCase)
  }

  const testPlans = plans.map((plan) => ({
    id: plan.id,
    title: plan.title,
    description: plan.description || '',
    objective: plan.objective || '',
    scope: plan.scope || '',
    module: plan.module || null,
    priority: plan.priority || 'medium',
    requirements: plan.requirements || [],
    casesCount: (casesByPlanId.get(String(plan._id)) || []).length,
  }))

  const testCasesByPlan = plans.map((plan) => ({
    planId: plan.id,
    planTitle: plan.title,
    testCases: casesByPlanId.get(String(plan._id)) || [],
  }))

  return {
    testSuiteId: String(suite._id),
    testPlans,
    testCasesByPlan,
    testStatus: suite.testStatus || 'Draft',
    lastGeneratedAt: suite.lastGeneratedAt || null,
    savedAt: suite.savedAt || null,
    executedAt: suite.executedAt || null,
    sessionSavedAt: suite.sessionSavedAt || null,
    validationStatus: suite.validationStatus || 'incomplete',
    validationSavedAt: suite.validationSavedAt || null,
  }
}

async function generatePlan({ req, body, file }) {
  const urlCible = String(body?.urlCible || body?.url_cible || '').trim()
  const userIdBody = String(body?.userId || '').trim()
  const providedTestSuiteId = String(body?.testSuiteId || '').trim()
  const suiteName = String(body?.nom || '').trim()
  const testName = String(body?.nametest || body?.nameTest || '').trim()
  const projectId = String(body?.projectId || '').trim()
  const styleConfig = String(
    body?.styleConfig ||
      body?.style_config ||
      body?.style_configuration ||
      body?.description ||
      ''
  ).trim()
  const regenerate = parseBoolean(body?.regenerate)
  const generationRequestId = String(body?.generationRequestId || body?.generation_request_id || '').trim()

  const userId = userIdBody || getUserIdFromAuthHeader(req)
  let specText = ''

  let suite = null
  let previousTestStatus = 'Draft'
  let newSuitePayload = null
  let uploadedSpec = null
  let ingestionScope = ''

  if (providedTestSuiteId) {
    suite = await TestSuite.findById(providedTestSuiteId)
    if (!suite) throw httpError(404, 'TestSuite not found')
    previousTestStatus = String(suite.testStatus || 'Draft')

    ingestionScope = String(suite.ingestionScope || '').trim()
    if (file) {
      ingestionScope = ingestionScope || crypto.randomUUID()
      uploadedSpec = await uploadSpecToFastApi(file, ingestionScope)
      specText = uploadedSpec.specText
    } else if (suite.specHash) {
      specText = String(suite.specText || '').trim()
    } else {
      throw specNotIngestedError()
    }
    const specTextStored = specText.slice(0, 50_000)
    const combinedDescription = [styleConfig, '', '---- SPEC EXTRACT ----', specText]
      .join('\n')
      .trim()
      .slice(0, 20_000)

    const updates = {
      description: combinedDescription,
      urlCible,
      specText: specTextStored,
      styleConfig,
      specHash: uploadedSpec?.specHash || suite.specHash || null,
      sourceSpecHash: uploadedSpec?.sourceSpecHash || suite.sourceSpecHash || null,
      ingestionScope,
    }
    if (file?.originalname) updates.specFileName = file.originalname
    if (file?.filename) updates.specFilePath = `uploads/specs/${file.filename}`
    if (suiteName) updates.nom = suiteName
    if (testName) updates.nametest = testName

    if (projectId) {
      const project = await Project.findById(projectId).select('_id').lean()
      if (!project) throw httpError(404, 'Project not found')
      updates.projectId = projectId
    }

    suite = await TestSuite.findByIdAndUpdate(providedTestSuiteId, updates, { new: true })
  } else {
    if (!userId) throw httpError(400, 'userId is required to create a TestSuite')
    if (!projectId) throw httpError(400, 'projectId is required to create a TestSuite')
    if (!file) throw httpError(400, 'file (.docx) is required')

    ingestionScope = crypto.randomUUID()
    uploadedSpec = await uploadSpecToFastApi(file, ingestionScope)
    specText = uploadedSpec.specText
    const specTextStored = specText.slice(0, 50_000)
    const combinedDescription = [styleConfig, '', '---- SPEC EXTRACT ----', specText]
      .join('\n')
      .trim()
      .slice(0, 20_000)

    const project = await Project.findById(projectId).select('_id').lean()
    if (!project) throw httpError(404, 'Project not found')

    const now = new Date()
    const defaultName = `Test Suite - ${now.toISOString().slice(0, 19).replace('T', ' ')}`
    newSuitePayload = {
      nom: suiteName || defaultName,
      nametest: testName || suiteName || defaultName,
      description: combinedDescription,
      urlCible,
      userId,
      specText: specTextStored,
      specHash: uploadedSpec.specHash,
      sourceSpecHash: uploadedSpec.sourceSpecHash,
      ingestionScope,
      styleConfig,
      specFileName: file?.originalname || null,
      specFilePath: file?.filename ? `uploads/specs/${file.filename}` : null,
      projectId,
    }
  }

  const testSuiteId = suite?._id ? String(suite._id) : ''

  if (!regenerate && suite) {
    const existingPlans = await TestPlan.find({ testSuiteId }).sort({ createdAt: 1 }).lean()
    if (existingPlans.length) {
      return {
        testSuiteId,
        testPlans: existingPlans.map((plan) => ({
          id: plan.id,
          title: plan.title,
          description: plan.description || '',
          objective: plan.objective || '',
          scope: plan.scope || '',
          module: plan.module || null,
          moduleId: plan.moduleId || null,
          planKind: plan.planKind || 'functional',
          coverageStatus: plan.coverageStatus || 'ready',
          priority: plan.priority || 'medium',
          requirements: plan.requirements || [],
          evidence: plan.evidence || [],
        })),
        reused: true,
      }
    }
  }

  if (suite) {
    suite.testStatus = 'Generating'
    await suite.save()
  }

  const specHash = String(uploadedSpec?.specHash || suite?.specHash || '').trim().toLowerCase()
  if (!specHash) throw specNotIngestedError()

  const baseUrl = getFastApiBaseUrl()
  let fastApiResponse
  try {
    const form = new FormData()
    form.append('spec_hash', specHash)
    form.append('styleConfig', styleConfig)
    form.append('applicationUrl', urlCible)
    form.append('test_suite_id', testSuiteId)
    form.append('generation_scope', 'plans')
    form.append('module_mode', regenerate ? 'regenerate' : 'ensure')
    if (generationRequestId) form.append('generation_request_id', generationRequestId)
    fastApiResponse = await axios.post(
      `${baseUrl}/generate-plan`,
      form,
      { timeout: getFastApiTimeoutMs(420_000), headers: { ...form.getHeaders(), ...getFastApiHeaders() } }
    )
  } catch (error) {
    const status = Number(error?.response?.status || error?.statusCode || 500)
    if (error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''))) {
      throw httpError(504, 'FastAPI request timed out while generating plans.')
    }
    if (status === 409) {
      if (error?.response?.data?.code === 'MODULE_GENERATION_IN_PROGRESS') {
        throw httpError(409, 'Module generation is already in progress. Retry shortly.', 'MODULE_GENERATION_IN_PROGRESS')
      }
      if (suite) {
        await TestSuite.findByIdAndUpdate(testSuiteId, {
          testStatus: previousTestStatus || 'Draft',
          lastGeneratedAt: new Date(),
        }).catch(() => {})
      }
      throw httpError(409, 'Generation cancelled by user.')
    }
    throw error
  }

  const testPlans = fastApiResponse?.data?.test_plans || fastApiResponse?.data?.testPlans
  if (!Array.isArray(testPlans) || !testPlans.length) {
    if (suite) {
      await TestSuite.findByIdAndUpdate(testSuiteId, {
        testStatus: 'Incomplete',
        lastGeneratedAt: new Date(),
      }).catch(() => {})
    }
    throw httpError(502, 'FastAPI returned empty test plans')
  }

  const normalizedPlansList = normalizeUniqueTestPlans(testPlans)
  if (!suite) {
    suite = await TestSuite.create({
      ...(newSuitePayload || {}),
    })
  }

  if (regenerate) {
    suite.planSteps = []
  }

  const maybeSteps =
    fastApiResponse?.data?.plan_steps ||
    fastApiResponse?.data?.planSteps ||
    fastApiResponse?.data?.steps ||
    fastApiResponse?.data?.plan

  const normalizedSteps = normalizePlanStepsPayload(maybeSteps)
  if (normalizedSteps.length) suite.planSteps = normalizedSteps

  const action = regenerate ? 'regenerate-plan' : 'generate-plan'
  const actor = await resolveActorName(getActorFromReq(req))
  suite.lastActionBy = { userId: actor.userId, name: actor.name || '', action, at: new Date() }

  suite.testStatus = 'Draft'
  suite.lastGeneratedAt = new Date()
  suite.savedAt = null
  await suite.save()

  await dualWriteTestPlans({ testSuiteId: suite._id, testPlans: normalizedPlansList }).catch(() => {})

  return {
    testSuiteId: String(suite._id),
    testPlans: normalizedPlansList,
    projectId: String(suite.projectId || projectId || ''),
    pendingReviewCount: Number(fastApiResponse?.data?.pending_review_count || 0),
    modules: Array.isArray(fastApiResponse?.data?.modules) ? fastApiResponse.data.modules : [],
    moduleStatus: String(fastApiResponse?.data?.module_status || 'pending'),
    moduleVersion: Number(fastApiResponse?.data?.module_version || 0),
    moduleCoverage: fastApiResponse?.data?.module_coverage || {},
    skippedModules: Array.isArray(fastApiResponse?.data?.skipped_modules)
      ? fastApiResponse.data.skipped_modules
      : [],
    reused: false,
  }
}

async function generateTestCases({ req, body }) {
    // ✅ AJOUTE CES LOGS EN HAUT
  console.log('🔍 generateTestCases CALLED:', {
    testSuiteId: body?.testSuiteId,
    planId: body?.planId,
    planTitle: body?.planTitle,
  })
  const testSuiteId = String(body?.testSuiteId || '').trim()
  const planId = String(body?.planId || body?.plan_id || '').trim()
  const planTitle = String(body?.planTitle || body?.plan_title || '').trim()
  const planDescription = String(body?.planDescription || body?.plan_description || '').trim()
  const regenerate = parseBoolean(body?.regenerate)
  const generationRequestId = String(body?.generationRequestId || body?.generation_request_id || '').trim()

  if (!testSuiteId) throw httpError(400, 'testSuiteId is required')
  if (!planId) throw httpError(400, 'planId is required')

  const suite = await TestSuite.findById(testSuiteId)
  if (!suite) throw httpError(404, 'TestSuite not found')
  if (!suite.specHash) throw specNotIngestedError()
  const previousTestStatus = String(suite.testStatus || 'Draft')

  const existingPlan = await TestPlan.findOne({ testSuiteId, id: planId }).lean()
  const existingCases = existingPlan
    ? await TestCase.find({ testSuiteId, planId: existingPlan._id }).sort({ createdAt: 1 }).lean()
    : []

  if (existingCases.length && !regenerate) {
    return {
      testSuiteId,
      planId,
      planTitle: existingPlan.title,
      testCases: existingCases,
      reused: true,
    }
  }

  // ✅ Extraire les métadonnées du plan existant pour dualWriteTestCases
  const existingPlanData = existingPlan
    ? {
        description: existingPlan.description,
        module: existingPlan.module,
        objective: existingPlan.objective,
        scope: existingPlan.scope,
        priority: existingPlan.priority,
        requirements: existingPlan.requirements,
      }
    : null

  await TestSuite.findByIdAndUpdate(testSuiteId, { testStatus: 'Generating' }).catch(() => {})

  const baseUrl = getFastApiBaseUrl()
  const project = suite?.projectId
    ? await Project.findById(suite.projectId).select('_id title').lean()
    : null

  let fastApiResponse
  try {
    const specTextToSend = String(body?.spec_text || '').trim() || String(suite.specText || '').trim()
    fastApiResponse = await axios.post(
      `${baseUrl}/generate-test-cases`,
      {
        plan_id: planId,
        plan_title: planTitle || planId,
        plan_description: planDescription || '',
        plan_module: existingPlan?.module || null,
        plan_module_id: existingPlan?.moduleId || null,
        spec_hash: suite.specHash,
        spec_text: truncateSpecText(specTextToSend, 800),
        style_config: String(suite.styleConfig || ''),
        project_id: project ? String(project._id) : undefined,
        project_title: project ? String(project.title || '') : undefined,
        test_suite_id: testSuiteId,
        generation_scope: 'cases',
        generation_request_id: generationRequestId || undefined,
      },
      { timeout: getFastApiTimeoutMs(420_000), headers: getFastApiHeaders() }
    )
  } catch (error) {
    const status = Number(error?.response?.status || error?.statusCode || 500)
    if (error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''))) {
      throw httpError(504, 'FastAPI request timed out while generating test cases.')
    }
    if (status === 409) {
      await TestSuite.findByIdAndUpdate(testSuiteId, {
        testStatus: previousTestStatus || 'Draft',
        lastGeneratedAt: new Date(),
      }).catch(() => {})
       console.error('🔥 generateTestCases ERROR:', error.message, error.stack)
      throw httpError(409, 'Generation cancelled by user.')
    }
    throw error
  }

  const testCases = fastApiResponse?.data?.test_cases || fastApiResponse?.data?.testCases
  const resolvedTitle = String(fastApiResponse?.data?.plan_title || planTitle || planId).trim()

  if (!Array.isArray(testCases) || !testCases.length) {
    await TestSuite.findByIdAndUpdate(testSuiteId, {
      testStatus: 'Incomplete',
      lastGeneratedAt: new Date(),
    }).catch(() => {})
    throw httpError(502, 'FastAPI returned empty test cases')
  }

  
const normalized = testCases
  .map((tc, idx) => {

    console.log('🚀 RAW stepDetails FROM API:', tc.stepDetails)

    return {
      id: String(tc?.id || `TC-${idx + 1}`).trim(),
      title: String(tc?.title || `Test Case ${idx + 1}`).trim(),

      steps: Array.isArray(tc?.steps)
        ? tc.steps.map((s) => String(s || '').trim()).filter(Boolean)
        : [],

      expected_result: String(tc?.expected_result || tc?.expectedResult || '').trim(),

      stepDetails: normalizeStepDetails(
        tc.stepDetails || tc.step_details || [],
        Array.isArray(tc?.steps) ? tc.steps : []
      ),

      ...normalizeTestCaseMetadata(tc),

      executionModel: tc?.executionModel || tc?.execution_model || null,
      createdBy: null,
    }
  })
  .slice(0, 50)


  const action = regenerate ? 'regenerate-test-case' : 'generate-test-case'
  const actor = await resolveActorName(getActorFromReq(req))
  const createdBy = actor?.userId
    ? {
        userId: String(actor.userId),
        name: String(actor.name || '').trim() || undefined,
        picture: String(actor.picture || '').trim() || undefined,
      }
    : null
  if (createdBy) {
    for (const item of normalized) {
      item.createdBy = createdBy
    }
  }

  suite.lastActionBy = { userId: actor.userId, name: actor.name || '', action, at: new Date() }
  suite.testStatus = 'Draft'
  suite.lastGeneratedAt = new Date()
  suite.savedAt = null
  await suite.save()

  // ✅ planData passé pour préserver les métadonnées si plan auto-créé
  const persistResult = await dualWriteTestCases({
    testSuiteId: suite._id,
    planKey: planId,
    planTitle: resolvedTitle,
    planData: existingPlanData,
    testCases: normalized,
  })

  if (!persistResult) {
    throw httpError(500, 'Test cases were generated but could not be saved to MongoDB.')
  }

  return { testSuiteId, planId, planTitle: resolvedTitle, testCases: normalized, reused: false }
}

async function getSpecDocument(testSuiteId) {
  const id = String(testSuiteId || '').trim()
  if (!id) throw httpError(400, 'testSuiteId is required')

  const suite = await TestSuite.findById(id).select('_id specFileName specFilePath').lean()
  if (!suite) throw httpError(404, 'TestSuite not found')

  const relPath = String(suite?.specFilePath || '').trim()
  if (!relPath) throw httpError(404, 'Specification document not found')

  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const absolute = path.resolve(process.cwd(), normalized)
  const uploadsRoot = path.resolve(process.cwd(), 'uploads')
  if (!absolute.startsWith(uploadsRoot + path.sep) && absolute !== uploadsRoot) {
    throw httpError(400, 'Invalid specification document path')
  }

  if (!fsSync.existsSync(absolute)) {
    throw httpError(404, 'Specification document file is missing on server')
  }

  return {
    absolutePath: absolute,
    fileName: String(suite?.specFileName || path.basename(absolute)).trim() || 'spec.docx',
  }
}

module.exports = {
  httpError,
  parseBoolean,
  getFastApiBaseUrl,
  fastApiHealth,
  fastApiChat,
  getTestsuitePlan,
  getTestsuiteTestPlans,
  getSpecDocument,
  generatePlan,
  generateTestCases,
  cancelGeneration,
  readSpecTextFromUpload,
  uploadSpecToFastApi,
  ingestSpecification,
  generatePlanForSuite,
  normalizeUniqueTestPlans,
}
