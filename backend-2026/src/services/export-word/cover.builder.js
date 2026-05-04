const { AlignmentType, ImageRun, PageBreak, Paragraph, TextRun } = require('docx')
const { formatDateDDMMYYYY } = require('./format.utils')

function paragraphLine(colorHex) {
  const { BorderStyle } = require('docx')
  return new Paragraph({
    border: {
      bottom: { color: colorHex, style: BorderStyle.SINGLE, size: 8 },
    },
    spacing: { after: 220 },
  })
}

function buildCoverChildren({ suiteName, urlCible, today, totalTestPlans, totalTestCases, logoBytes }) {
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
  return coverChildren
}

module.exports = { buildCoverChildren }

