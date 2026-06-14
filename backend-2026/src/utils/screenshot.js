const fs = require('fs')
const path = require('path')

async function captureStepScreenshot(
  driver,
  stepIndex,
  action
) {

  const base64 = await driver.takeScreenshot()

  const dir = path.resolve(
    __dirname,
    '..',
    '..',
    'uploads',
    'screenshots'
  )

  fs.mkdirSync(dir, { recursive: true })

  const filename =
    `step-${stepIndex}-${action}-${Date.now()}.png`

  const filePath = path.join(dir, filename)

  fs.writeFileSync(filePath, base64, 'base64')

  return {
    filename,
    path: filePath,
    publicUrl: `/api/uploads/screenshots/${filename}`,
    createdAt: new Date().toISOString()
  }
}

module.exports = {
  captureStepScreenshot
}