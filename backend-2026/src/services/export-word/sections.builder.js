const { AlignmentType, PageBreak, Paragraph, ShadingType, TextRun } = require('docx')
const { makeStepsTable } = require('./table.builder')

function paragraphLine(colorHex) {
  const { BorderStyle } = require('docx')
  return new Paragraph({
    border: {
      bottom: { color: colorHex, style: BorderStyle.SINGLE, size: 8 },
    },
    spacing: { after: 220 },
  })
}

function buildPlanSections({ testPlans, testCasesByPlan }) {
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

  return planSections
}

module.exports = { buildPlanSections }

