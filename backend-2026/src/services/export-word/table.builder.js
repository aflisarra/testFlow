const {
  AlignmentType,
  BorderStyle,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require('docx')

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

module.exports = { makeStepsTable }

