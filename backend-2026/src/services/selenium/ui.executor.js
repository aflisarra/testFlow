const { By, until, Key } = require('selenium-webdriver')
const { getLocator } = require('../../utils/locator')
const { addLog } = require('../../utils/logger')
const { captureStepScreenshot } = require('../../utils/screenshot')
const { highlightElement } = require('../../utils/visual')

async function runStructuredUiStep(driver, step, ctx, stepIndex) {

  const action = (step.action || '').toLowerCase()

  //console.log(`\n➡️ STEP ${stepIndex}: ${step.raw || action}`)

  // ─── NAVIGATE ─────────────────────────────────
  if (action === 'open_app' || action === 'navigate') {
    

    const url = step?.target?.url || ctx.baseUrl
    addLog(ctx.logs, stepIndex, "ACTION", "Navigate", { url })

    

    

    console.log(`🌍 NAVIGATE → ${url}`)

    if (!url || !url.startsWith('http')) {
      throw new Error("Invalid URL: " + url)
    }

    await driver.get(url)
    await driver.wait(until.elementLocated(By.css('body')), 10000)

    const shot = await captureStepScreenshot(driver, stepIndex, "navigate")
    
addLog(ctx.logs, stepIndex, "INFO", "Navigation screenshot", {
  screenshot: shot?.publicUrl || shot?.path
})

addLog(ctx.logs, stepIndex, "SUCCESS", "Page loaded", {
  url
})


    return {
      status: 'passed',
      screenshots: [shot]
    }
  }

  // ─── TYPE ─────────────────────────────────
  if (action === 'type') {



    const screenshots = []

    



    // ✅ INPUTS
    for (const field of step.fields || []) {


      addLog(ctx.logs, stepIndex, "ACTION", "Typing field", {
  selector: field.selector,
  value: field.value
})
      const element = await driver.wait(
        until.elementLocated(getLocator(field)),
        10000
      )

      await highlightElement(driver, element)

      const before = await captureStepScreenshot(driver, stepIndex, 'before-type')
      screenshots.push(before)

      await element.clear()
      await element.sendKeys(field.value)

      console.log(`⌨️ FIELD ${field.selector} = ${field.value}`)

      const after = await captureStepScreenshot(driver, stepIndex, 'after-type')
      screenshots.push(after)
      addLog(ctx.logs, stepIndex, "INFO", "Before typing screenshot", {
  screenshot: before?.publicUrl || before?.path
})

addLog(ctx.logs, stepIndex, "SUCCESS", "Field filled", {
  selector: field.selector
})

    }

// ✅ RADIOS
for (const radio of step.radios || []) {

  try {

    console.log(`🔘 RADIO START ${radio.selector}`)

    const el = await driver.findElement(
      getLocator(radio)
    )

    await driver.executeScript(
      "arguments[0].scrollIntoView({block:'center'})",
      el
    )

    await driver.sleep(500)

    await driver.executeScript(
      'arguments[0].click()',
      el
    )

    const shot = await captureStepScreenshot(
      driver,
      stepIndex,
      'radio'
    )

    screenshots.push(shot)

    addLog(
      ctx.logs,
      stepIndex,
      "SUCCESS",
      "Radio selected",
      {
        selector: radio.selector,
        screenshot: shot?.publicUrl || shot?.path
      }
    )

    console.log(`✅ RADIO OK ${radio.selector}`)

  } catch (err) {

    console.error(`❌ RADIO FAIL`, err)

    addLog(
      ctx.logs,
      stepIndex,
      "ERROR",
      "Radio selection failed",
      {
        selector: radio.selector,
        error: err.message
      }
    )

    throw err
  }
}

    // ✅ CHECKBOXES
// ✅ CHECKBOXES
for (const checkbox of step.checkboxes || []) {

  try {

    console.log(`☑️ CHECKBOX START ${checkbox.selector}`)

    const el = await driver.findElement(
      getLocator(checkbox)
    )

    await driver.executeScript(
      "arguments[0].scrollIntoView({block:'center'})",
      el
    )

    await driver.sleep(500)

    await driver.executeScript(
      'arguments[0].click()',
      el
    )

    const shot = await captureStepScreenshot(
      driver,
      stepIndex,
      'checkbox'
    )

    screenshots.push(shot)

    addLog(
      ctx.logs,
      stepIndex,
      "SUCCESS",
      "Checkbox selected",
      {
        selector: checkbox.selector,
        screenshot: shot?.publicUrl || shot?.path
      }
    )

    console.log(`✅ CHECKBOX OK ${checkbox.selector}`)

  } catch (err) {

    console.error(`❌ CHECKBOX FAIL`, err)

    addLog(
      ctx.logs,
      stepIndex,
      "ERROR",
      "Checkbox selection failed",
      {
        selector: checkbox.selector,
        error: err.message
      }
    )

    throw err
  }
}

    // ✅ FILE UPLOAD
    for (const upload of step.uploads || []) {

      const el = await driver.findElement(getLocator(upload))

      await el.sendKeys(upload.path)

      const shot = await captureStepScreenshot(driver, stepIndex, 'upload')
      screenshots.push(shot)

      console.log(`📂 UPLOAD ${upload.path}`)
      
addLog(ctx.logs, stepIndex, "SUCCESS", "File uploaded", {
  path: upload.path
})

    }

    // ✅ SELECT
    for (const select of step.selects || []) {

      const el = await driver.findElement(getLocator(select))

      await el.sendKeys(select.value)
      await el.sendKeys(Key.ENTER)

      const shot = await captureStepScreenshot(driver, stepIndex, 'select')
      screenshots.push(shot)

      console.log(`📋 SELECT ${select.value}`)
      
addLog(ctx.logs, stepIndex, "SUCCESS", "Option selected", {
  value: select.value
})

    }

    const finalShot = await captureStepScreenshot(driver, stepIndex, 'final-step')
    screenshots.push(finalShot)

    return {
      status: 'passed',
      screenshots
    }
  }

  // ─── CLICK ─────────────────────────────────
  if (action === 'click' || action === 'submit') {

    const screenshots = []

    
addLog(ctx.logs, stepIndex, "ACTION", "Click", {
  selector: step.target.selector
})


    const el = await driver.wait(
      until.elementLocated(getLocator(step.target)),
      10000
    )

    await highlightElement(driver, el)

    const before = await captureStepScreenshot(driver, stepIndex, 'before-click')
    screenshots.push(before)



await driver.sleep(500)

await driver.wait(
  until.elementIsVisible(el),
  5000
)

await driver.wait(
  until.elementIsEnabled(el),
  5000
)



await driver.sleep(500)

await driver.wait(
  until.elementIsVisible(el),
  5000
)

await driver.wait(
  until.elementIsEnabled(el),
  5000
)

await driver.executeScript(
  'arguments[0].click()',
  el
)

await driver.sleep(1000)

const after = await captureStepScreenshot(
  driver,
  stepIndex,
  'after-click'
)

screenshots.push(after)

console.log(`🖱 CLICK ${step.target.selector}`)

// ✅ VERIFY SUCCESS MODAL
try {

  const successModal = await driver.wait(

    until.elementLocated(
      By.id('example-modal-sizes-title-lg')
    ),

    5000
  )

  if (successModal) {
    const successShot =
  await captureStepScreenshot(
    driver,
    stepIndex,
    'submit-success'
  )

screenshots.push(successShot)

addLog(
  ctx.logs,
  stepIndex,
  "INFO",
  "Submit success screenshot",
  {
    screenshot:
      successShot?.publicUrl ||
      successShot?.path
  }
)

    addLog(
      ctx.logs,
      stepIndex,
      "SUCCESS",
      "Form submitted successfully"
    )

    return {
      status: 'passed',
      actual: 'Form submitted successfully',
      screenshots
    }
  }

} catch (e) {

  addLog(
    ctx.logs,
    stepIndex,
    "WARN",
    "Submit confirmation modal not found"
  )

  return {
    status: 'failed_assertion',
    error: 'Submit confirmation modal not found',
    screenshots
  }
}
addLog(ctx.logs, stepIndex, "INFO", "After click screenshot", {
  screenshot: after?.publicUrl || after?.path
})
    return {
      status: 'passed',
      screenshots
    }

    
  }

  // ─── ASSERTION ─────────────────────────────────
  if (action === 'assert_text') {

    const el = await driver.findElement(getLocator(step.target))
    



    const actual = await el.getText()
    const expected = step.assertion?.expected || ''

    addLog(ctx.logs, stepIndex, "CHECK", "Assertion", {
  expected,
  actual
})

    console.log(`🧪 ASSERT`)
    console.log(`👉 EXPECTED: "${expected}"`)
    console.log(`👉 ACTUAL:   "${actual}"`)

    if (!actual.includes(expected)) {

      console.log(`❌ ASSERTION FAILED`)

      return {
        status: 'failed_assertion',
        actual,
        expected,
        error: `Expected "${expected}" but got "${actual}"`,
        screenshots: []
      }
    }

    console.log(`✅ ASSERTION PASSED`)

    return {
      status: 'passed',
      actual,
      expected,
      screenshots: []
    }
  }

  // ─── DEFAULT ─────────────────────────────────
  throw new Error("Unsupported action: " + action)
}

module.exports = { runStructuredUiStep }
