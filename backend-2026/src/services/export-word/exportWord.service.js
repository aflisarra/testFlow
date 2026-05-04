const {
  Document,
  Header,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} = require('docx')
const fs = require('fs')
const path = require('path')
const TestSuite = require('../../models/testsuite')

const { formatDateForFilename, sanitizeFilename } = require('./format.utils')
const { makeFooter } = require('./footer.builder')
const { buildCoverChildren } = require('./cover.builder')
const { buildTOCChildren } = require('./toc.builder')
const { buildPlanSections } = require('./sections.builder')

function tryReadLogo() {
  // Expected path: /public/logo.png (project root)
  try {
    const logoPath = path.join(__dirname, '..', '..', '..', 'public', 'logo.png')
    return fs.readFileSync(logoPath)
  } catch {
    return null
  }
}

async function exportWordService(req, res) {
  try {
    const suiteId = String(req.params.id || '').trim()
    const suite = await TestSuite.findById(suiteId).lean()
    if (!suite) {
      return res.status(404).json({ message: 'TestSuite not found' })
    }

    const suiteName = String(suite.nom || 'TestSuite').trim() || 'TestSuite'
    const urlCible = String(suite.urlCible || '').trim()
    const today = new Date()

    const testPlans = Array.isArray(suite.testPlans) ? suite.testPlans : []
    const testCasesByPlan = Array.isArray(suite.testCasesByPlan) ? suite.testCasesByPlan : []

    const totalTestPlans = testPlans.length
    const totalTestCases = testCasesByPlan.reduce((acc, p) => {
      const list = Array.isArray(p?.testCases) ? p.testCases : []
      return acc + list.length
    }, 0)

    const logoBytes = tryReadLogo()

    // Footer (not on cover)
    const footer = makeFooter({ suiteName, logoBytes })

    const coverChildren = buildCoverChildren({
      suiteName,
      urlCible,
      today,
      totalTestPlans,
      totalTestCases,
      logoBytes,
    })

    const tocChildren = buildTOCChildren({ testPlans })

    const planSections = buildPlanSections({ testPlans, testCasesByPlan })

    const doc = new Document({
      sections: [
        {
          properties: {
            page: { margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1), right: convertInchesToTwip(1) } },
          },
          // Cover: no footer
          headers: { default: new Header({ children: [] }) },
          children: coverChildren,
        },
        {
          properties: {},
          footers: { default: footer },
          headers: { default: new Header({ children: [] }) },
          children: tocChildren,
        },
        {
          properties: {},
          footers: { default: footer },
          headers: { default: new Header({ children: [] }) },
          children: planSections.length ? planSections : [new Paragraph({ children: [new TextRun({ text: 'No content.', italics: true, color: '666666' })] })],
        },
      ],
    })

    const buffer = await Packer.toBuffer(doc)
    const filename = `TestPlan_${sanitizeFilename(suiteName)}_${formatDateForFilename(today)}.docx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename=\"${filename}\"`)
    return res.status(200).send(buffer)
  } catch (err) {
    console.error('exportWord error:', err)
    return res.status(500).json({ message: 'Failed to export Word document' })
  }
}

module.exports = { exportWordService }

