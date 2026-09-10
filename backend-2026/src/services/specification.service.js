const path = require('path')
const fs = require('fs/promises')
const fsSync = require('fs')
const mammoth = require('mammoth')

const TestSuite = require('../models/testsuite')
const { httpError } = require('./ollama.service')

function normalizeUploadsRoot() {
  return path.resolve(process.cwd(), 'uploads')
}

function resolveSpecAbsolutePath(specFilePath) {
  const relPath = String(specFilePath || '').trim()
  if (!relPath) throw httpError(404, 'Specification document not found')

  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const absolute = path.resolve(process.cwd(), normalized)
  const uploadsRoot = normalizeUploadsRoot()

  if (!absolute.startsWith(uploadsRoot + path.sep) && absolute !== uploadsRoot) {
    throw httpError(400, 'Invalid specification document path')
  }

  return absolute
}

async function getSpecificationContent(testSuiteId) {
  const id = String(testSuiteId || '').trim()
  if (!id) throw httpError(400, 'testSuiteId is required')

  const suite = await TestSuite.findById(id).select('_id specFileName specFilePath specHtml').lean()
  if (!suite) throw httpError(404, 'TestSuite not found')

  const storedHtml = String(suite.specHtml || '').trim()
  if (storedHtml && String(suite.specHtmlPath || '').trim()) {
    return {
      testSuiteId: id,
      fileName: String(suite.specFileName || 'spec.docx').trim() || 'spec.docx',
      mimeType: 'text/html',
      content: storedHtml,
      messages: [],
    }
  }

  const absolutePath = resolveSpecAbsolutePath(suite.specFilePath)
  if (!fsSync.existsSync(absolutePath)) {
    throw httpError(404, 'Specification document file is missing on server')
  }

  const buffer = await fs.readFile(absolutePath)
  const ext = path.extname(String(suite.specFileName || absolutePath)).toLowerCase()

  if (ext === '.docx') {
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        includeDefaultStyleMap: true,
      }
    )
    const html = String(result.value || '').trim()
    return {
      testSuiteId: id,
      fileName: String(suite.specFileName || path.basename(absolutePath)).trim() || 'spec.docx',
      mimeType: 'text/html',
      content: html || `<pre>${String(buffer.toString('utf8') || '')}</pre>`,
      messages: result.messages || [],
    }
  }

  if (ext === '.md' || ext === '.txt') {
    const content = String(buffer.toString('utf8') || '').trim()
    return {
      testSuiteId: id,
      fileName: String(suite.specFileName || path.basename(absolutePath)).trim() || 'spec.txt',
      mimeType: 'text/plain',
      content,
      messages: [],
    }
  }

  throw httpError(415, 'Unsupported specification file type')
}

async function updateSpecificationContent(testSuiteId, htmlContent) {
  const id = String(testSuiteId || '').trim()
  if (!id) throw httpError(400, 'testSuiteId is required')

  const suite = await TestSuite.findById(id)
  if (!suite) throw httpError(404, 'TestSuite not found')

  const content = String(htmlContent || '').trim()
  if (!content) throw httpError(400, 'content is required')

  const absolutePath = resolveSpecAbsolutePath(suite.specFilePath)
  if (!fsSync.existsSync(absolutePath)) {
    throw httpError(404, 'Specification document file is missing on server')
  }

  const newFileName = String(suite.specFileName || path.basename(absolutePath)).trim() || 'spec.docx'

  suite.specHtml = content
  suite.specHtmlUpdatedAt = new Date()
  suite.specHtmlPath = absolutePath.replace(/\.docx$/i, '.html')
  suite.specText = content
    .replace(/<\/(?:p|div|h[1-6]|li|tr|table|section|article|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  suite.specFileName = newFileName

  await fs.writeFile(suite.specHtmlPath, content, 'utf8')

  await suite.save()

  return {
    testSuiteId: id,
    fileName: newFileName,
    content,
  }
}

module.exports = {
  getSpecificationContent,
  updateSpecificationContent,
}
