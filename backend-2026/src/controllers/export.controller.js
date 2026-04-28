const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} = require('docx')
const fs = require('fs')
const path = require('path')
const TestSuite = require('../models/testsuite')

function formatDateDDMMYYYY(date) {
  const d = date instanceof Date ? date : new Date(date)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  return `${dd}/${mm}/${yyyy}`
}

function formatDateForFilename(date) {
  const d = date instanceof Date ? date : new Date(date)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  return `${yyyy}-${mm}-${dd}`
}

function sanitizeFilename(value) {
  return String(value || 'TestSuite')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80)
}

function tryReadLogo() {
  // Expected path: /public/logo.png (project root)
  try {
    const logoPath = path.join(__dirname, '..', '..', 'public', 'logo.png')
    return fs.readFileSync(logoPath)
  } catch {
    return null
  }
}

function paragraphLine(colorHex) {
  return new Paragraph({
    border: {
      bottom: { color: colorHex, style: BorderStyle.SINGLE, size: 8 },
    },
    spacing: { after: 220 },
  })
}

function makeStepsTable(steps) {
  const rows = []
  const safeSteps = Array.isArray(steps) ? steps : []

  const border = {
    top: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
    bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
    left: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
    right: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
  }

  for (let i = 0; i < safeSteps.length; i++) {
    const stepText = String(safeSteps[i] ?? '').trim() || '-'
    const stepNo = i + 1

    rows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 22, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E8F0FC' },
            borders: border,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `Step ${stepNo}`,
                    bold: true,
                    size: 20,
                    color: '1B3A6B',
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 78, type: WidthType.PERCENTAGE },
            borders: border,
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: stepText,
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    )
  }

  if (rows.length === 0) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            borders: border,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'No steps.', italics: true, size: 20, color: '666666' }),
                ],
              }),
            ],
          }),
        ],
      })
    )
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  })
}

function makeFooter({ suiteName, logoBytes }) {
  const line = new Paragraph({
    border: {
      top: { color: 'DDDDDD', style: BorderStyle.SINGLE, size: 6 },
    },
    spacing: { before: 120, after: 80 },
  })

  const left = logoBytes
    ? [
        new ImageRun({
          data: logoBytes,
          transformation: { width: 50, height: 50 },
        }),
      ]
    : [new TextRun({ text: 'TestFlowAi', color: '555555', size: 18 })]

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            borders: { top: borderNone(), bottom: borderNone(), left: borderNone(), right: borderNone() },
            children: [new Paragraph({ children: left })],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: { top: borderNone(), bottom: borderNone(), left: borderNone(), right: borderNone() },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: suiteName, color: '555555', size: 18 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            borders: { top: borderNone(), bottom: borderNone(), left: borderNone(), right: borderNone() },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: 'Page ', color: '555555', size: 18 }),
                  new TextRun({ children: [PageNumber.CURRENT] }),
                  new TextRun({ text: ' of ', color: '555555', size: 18 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  })

  return new Footer({
    children: [line, table],
  })
}

function borderNone() {
  return { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
}

exports.exportWord = async (req, res) => {
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

    const coverChildren = []
    coverChildren.push(
      new Paragraph({
        spacing: { before: 400, after: 300 },
        alignment: AlignmentType.CENTER,
        children: logoBytes
          ? [
              new ImageRun({
                data: logoBytes,
                transformation: { width: 200, height: 200 },
              }),
            ]
          : [],
      })
    )

    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: 'Test Plan Report',
            bold: true,
            size: 72, // 36pt
            color: '1B3A6B',
          }),
        ],
      })
    )

    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 220 },
        children: [
          new TextRun({
            text: suiteName,
            bold: true,
            size: 48, // 24pt
            color: 'E87722',
          }),
        ],
      })
    )

    coverChildren.push(paragraphLine('E87722'))

    const infoStyle = { size: 24, color: '555555' } // 12pt
    coverChildren.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: 'Project URL: ', bold: true, ...infoStyle }),
          new TextRun({ text: urlCible || '-', ...infoStyle }),
        ],
      })
    )
    coverChildren.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: 'Generated: ', bold: true, ...infoStyle }),
          new TextRun({ text: formatDateDDMMYYYY(today), ...infoStyle }),
        ],
      })
    )
    coverChildren.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: 'Total Test Plans: ', bold: true, ...infoStyle }),
          new TextRun({ text: String(totalTestPlans), ...infoStyle }),
        ],
      })
    )
    coverChildren.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: 'Total Test Cases: ', bold: true, ...infoStyle }),
          new TextRun({ text: String(totalTestCases), ...infoStyle }),
        ],
      })
    )

    coverChildren.push(new PageBreak())

    // Table of contents page (page numbers are approximate)
    const tocChildren = []
    tocChildren.push(
      new Paragraph({
        children: [new TextRun({ text: 'Table of Contents', bold: true, size: 36, color: '1B3A6B' })],
        spacing: { after: 120 },
      })
    )
    tocChildren.push(paragraphLine('DDDDDD'))

    if (testPlans.length === 0) {
      tocChildren.push(
        new Paragraph({
          children: [new TextRun({ text: 'No test plans.', italics: true, color: '666666', size: 24 })],
        })
      )
    } else {
      // Cover=1, TOC=2, each TP starts on 3 + index (approx.)
      for (let i = 0; i < testPlans.length; i++) {
        const tp = testPlans[i] || {}
        const title = String(tp.title || `TP-${i + 1}`).trim()
        const approxPage = 3 + i
        tocChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: `TP-${i + 1} — ${title}`, size: 24, color: '555555' }),
              new TextRun({ text: `  (p. ${approxPage})`, size: 24, color: '999999' }),
            ],
            spacing: { after: 120 },
          })
        )
      }
    }
    tocChildren.push(new PageBreak())

    // Build sections for each test plan
    const planSections = []

    for (let i = 0; i < testPlans.length; i++) {
      const tp = testPlans[i] || {}
      const tpIndex = i + 1
      const tpId = String(tp.id || '').trim()
      const tpTitle = String(tp.title || `TP-${tpIndex}`).trim()
      const tpDesc = String(tp.description || '').trim()

      const tcBlock =
        testCasesByPlan.find((p) => String(p?.planId || '').trim() === tpId) ||
        testCasesByPlan.find((p) => String(p?.planTitle || '').trim() === tpTitle) ||
        null

      const testCases = Array.isArray(tcBlock?.testCases) ? tcBlock.testCases : []

      planSections.push(
        new Paragraph({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F6F8FB' },
          spacing: { after: 120 },
          children: [
            new TextRun({ text: `TP-${tpIndex}`, bold: true, size: 28, color: 'E87722' }),
            new TextRun({ text: '  ', size: 28 }),
            new TextRun({ text: tpTitle, bold: true, size: 28, color: '1B3A6B' }),
          ],
        })
      )

      if (tpDesc) {
        planSections.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: tpDesc, italics: true, size: 22, color: '666666' })],
          })
        )
      }

      planSections.push(paragraphLine('DDDDDD'))

      if (!testCases.length) {
        planSections.push(
          new Paragraph({
            children: [new TextRun({ text: 'No test cases for this plan.', italics: true, size: 24, color: '666666' })],
            spacing: { after: 240 },
          })
        )
      } else {
        for (let j = 0; j < testCases.length; j++) {
          const tc = testCases[j] || {}
          const tcIndex = j + 1
          const tcTitle = String(tc.title || '').trim() || `Test Case ${tcIndex}`
          const tcSteps = Array.isArray(tc.steps) ? tc.steps : []
          const expected = String(tc.expected_result || '').trim()

          planSections.push(
            new Paragraph({
              spacing: { before: 160, after: 80 },
              children: [
                new TextRun({
                  text: `TC-${tpIndex}.${tcIndex}`,
                  bold: true,
                  underline: {},
                  size: 22,
                  color: '1B3A6B',
                }),
              ],
            })
          )

          planSections.push(
            new Paragraph({
              spacing: { after: 120 },
              children: [new TextRun({ text: tcTitle, bold: true, size: 22, color: '000000' })],
            })
          )

          planSections.push(makeStepsTable(tcSteps))

          planSections.push(
            new Paragraph({
              spacing: { before: 120, after: 240 },
              children: [
                new TextRun({
                  text: 'Expected Result: ',
                  bold: true,
                  size: 20,
                  color: '2E7D32',
                }),
                new TextRun({ text: expected || '-', size: 20, color: '000000' }),
              ],
            })
          )
        }
      }

      // Page break between each TP (except last)
      if (i < testPlans.length - 1) {
        planSections.push(new PageBreak())
      }
    }

    // If there are no testPlans but we still have testCasesByPlan, list them as orphan sections
    if (testPlans.length === 0 && testCasesByPlan.length > 0) {
      for (let i = 0; i < testCasesByPlan.length; i++) {
        const block = testCasesByPlan[i] || {}
        const tpIndex = i + 1
        const tpTitle = String(block.planTitle || `Plan ${tpIndex}`).trim()
        const testCases = Array.isArray(block.testCases) ? block.testCases : []

        planSections.push(
          new Paragraph({
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F6F8FB' },
            spacing: { after: 120 },
            children: [
              new TextRun({ text: `TP-${tpIndex}`, bold: true, size: 28, color: 'E87722' }),
              new TextRun({ text: '  ', size: 28 }),
              new TextRun({ text: tpTitle, bold: true, size: 28, color: '1B3A6B' }),
            ],
          })
        )
        planSections.push(paragraphLine('DDDDDD'))

        if (!testCases.length) {
          planSections.push(
            new Paragraph({
              children: [new TextRun({ text: 'No test cases for this plan.', italics: true, size: 24, color: '666666' })],
              spacing: { after: 240 },
            })
          )
        }

        if (i < testCasesByPlan.length - 1) {
          planSections.push(new PageBreak())
        }
      }
    }

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

