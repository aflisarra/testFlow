//const { By, until } = require('selenium-webdriver')
const { highlightElement } = require('../../utils/visual')
const { captureStepScreenshot } = require('../../utils/screenshot')
const { addLog } = require('../../utils/logger')
  const { By, until, Key } = require('selenium-webdriver')
async function runStructuredUiStep(driver, step, ctx, stepIndex) {

  const action = (step.action || '').toLowerCase()

  // ✅ NAVIGATE
  if (action === 'open_app' || action === 'navigate') {

    const url = step?.target?.url || ctx.baseUrl

    if (!url || !url.startsWith('http')) {
      throw new Error("Invalid URL: " + url)
    }

    addLog(ctx.logs, stepIndex, "ACTION", "Navigate", { url })

    await driver.get(url)
    await driver.wait(until.elementLocated(By.css('body')), 10000)

    await driver.sleep(1000)

    const screenshot = await captureStepScreenshot(driver, stepIndex, "navigate")

    addLog(ctx.logs, stepIndex, "SUCCESS", "Page loaded", { screenshot })

    return { screenshot }
  }

  // ✅ TYPE


if (action === 'type') {

  addLog(ctx.logs, stepIndex, "ACTION", "Start form filling")

  // ✅ FIRST NAME
  addLog(ctx.logs, stepIndex, "ACTION", "Typing", {
    field: "firstName",
    value: "Sarra"
  })

  const firstName = await driver.findElement(By.id('firstName'))
  await firstName.sendKeys("Sarra")
  await firstName.sendKeys(Key.TAB)

  addLog(ctx.logs, stepIndex, "SUCCESS", "First name filled")


  // ✅ LAST NAME
  addLog(ctx.logs, stepIndex, "ACTION", "Typing", {
    field: "lastName",
    value: "Test"
  })

  const lastName = await driver.findElement(By.id('lastName'))
  await lastName.sendKeys("Test")
  await lastName.sendKeys(Key.TAB)

  addLog(ctx.logs, stepIndex, "SUCCESS", "Last name filled")


  // ❌ EMAIL INVALID
  addLog(ctx.logs, stepIndex, "ACTION", "Typing", {
    field: "email",
    value: "abc"
  })

  const email = await driver.findElement(By.id('userEmail'))
  await email.sendKeys("abc")
  await email.sendKeys(Key.TAB)

  addLog(ctx.logs, stepIndex, "WARN", "Invalid email format detected")


  // ✅ GENDER
  addLog(ctx.logs, stepIndex, "ACTION", "Click", {
    field: "gender",
    value: "Male"
  })

  const gender = await driver.findElement(By.css("label[for='gender-radio-1']"))
  await driver.executeScript("arguments[0].click()", gender)

  addLog(ctx.logs, stepIndex, "SUCCESS", "Gender selected")


  // ❌ MOBILE INVALID
  addLog(ctx.logs, stepIndex, "ACTION", "Typing", {
    field: "mobile",
    value: "123"
  })

  const mobile = await driver.findElement(By.id('userNumber'))
  await mobile.sendKeys("123")
  await mobile.sendKeys(Key.TAB)

  addLog(ctx.logs, stepIndex, "WARN", "Invalid mobile number detected")


  // ✅ ADDRESS
  addLog(ctx.logs, stepIndex, "ACTION", "Typing", {
    field: "address",
    value: "Tunis"
  })

  const address = await driver.findElement(By.id('currentAddress'))
  await address.sendKeys("Tunis")
  await address.sendKeys(Key.TAB)

  addLog(ctx.logs, stepIndex, "SUCCESS", "Address filled")


  await driver.sleep(1000)

  const screenshot = await captureStepScreenshot(driver, stepIndex, "detailed-fill")

  addLog(ctx.logs, stepIndex, "SUCCESS", "Form filling completed", {
    screenshot
  })

  return { screenshot }
}


  // ✅ CLICK
 if (action === 'click' || action === 'submit') {

  const element = await driver.wait(
    until.elementLocated(By.css('#submit')),
    8000
  )

  await driver.wait(until.elementIsVisible(element), 8000)

  addLog(ctx.logs, stepIndex, "ACTION", "Click Submit")

  // ✅ IMPORTANT : scroll vers le bouton
  await driver.executeScript("arguments[0].scrollIntoView(true);", element)
  await driver.sleep(500)

  await highlightElement(driver, element)

  const before = await captureStepScreenshot(driver, stepIndex, "before-click")

  // ✅ CLICK JS (corrige bug interactable)
  await driver.executeScript("arguments[0].click();", element)

  await driver.sleep(1000)

  const after = await captureStepScreenshot(driver, stepIndex, "after-click")

  addLog(ctx.logs, stepIndex, "SUCCESS", "Form submitted", { before, after })

  return { screenshot: after }
}


  throw new Error("Unsupported action: " + action)
}

module.exports = { runStructuredUiStep }