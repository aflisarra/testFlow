const {
  AlignmentType,
  BorderStyle,
  Footer,
  ImageRun,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require('docx')

function borderNone() {
  return { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
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

module.exports = { makeFooter, borderNone }

