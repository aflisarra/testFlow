const { PageBreak, Paragraph, TextRun } = require('docx')

function paragraphLine(colorHex) {
  const { BorderStyle } = require('docx')
  return new Paragraph({
    border: {
      bottom: { color: colorHex, style: BorderStyle.SINGLE, size: 8 },
    },
    spacing: { after: 220 },
  })
}

function buildTOCChildren({ testPlans }) {
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

  return tocChildren
}

module.exports = { buildTOCChildren }

