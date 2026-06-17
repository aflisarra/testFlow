const { By, until } = require('selenium-webdriver')
const axios = require('axios')

const { captureStepScreenshot } = require('../../utils/screenshot')
const { highlightElement } = require('../../utils/visual')
const { addLog } = require('../../utils/logger')

async function runStructuredUiStep(driver, step, ctx, stepIndex) {

  try {

    // ✅ STEP 1: OPEN PAGE
    if (stepIndex === 1) {

      const url = ctx.baseUrl

      console.log("🌍 OPEN:", url)

      await driver.get(url)
      await driver.wait(until.elementLocated(By.css('body')), 10000)

      const screenshot = await captureStepScreenshot(driver, stepIndex, "open")

      addLog(ctx.logs, stepIndex, "INFO", "Page opened", { url })

      return {
        status: 'passed',
        screenshots: [screenshot]
      }
    }

    // ✅ GET DOM
   const elements = await driver.executeScript(() => {
  return Array.from(document.querySelectorAll('input, button, textarea, select')).map(el => ({
    tag: el.tagName.toLowerCase(),
    id: el.id,
    name: el.name,
    type: el.type,
    placeholder: el.placeholder,
    text: el.innerText,
    value: el.value
  }))
})

   
const resp = await axios.post(
  "http://localhost:8000/ai/decide",
  {
    step: step,
    dom: elements,
    test_case: ctx.testCase
  }
)


    const decisions = resp.data
    const actions = Array.isArray(decisions) ? decisions : [decisions]

    const screenshots = []

    console.log("🧠 AI:", actions)

    // ✅ LOOP ACTIONS
    // ✅ LOOP ACTIONS (reste pareil)
for (let i = 0; i < actions.length; i++) {

  const act = actions[i]

 let action = act?.action
let selector = act?.target?.selector
const value = act?.value || ""

if (!selector) {
  addLog(ctx.logs, stepIndex, "WARN", "No selector", act)
  continue
}

// ✅ 1. sauver l'ancien selector pour logs
const originalSelector = selector

// ✅ 2. CORRIGER le &gt;
selector = selector.replace(/&gt;/g, ">")

// ✅ 3. bloquer les selectors complexes
if (selector.includes(">")) {
  console.log("❌ BAD SELECTOR SKIPPED:", originalSelector)
  continue
}

  if (!selector) {
    addLog(ctx.logs, stepIndex, "WARN", "No selector", act)
    continue
  }

  if (selector.includes(">")) {
    console.log("❌ BAD SELECTOR SKIPPED:", selector)
    continue
  }

  try {

    const el = await driver.wait(
      until.elementLocated(By.css(selector)),
      5000
    )

    // 🔴 highlight
    await highlightElement(driver, el)
    await driver.sleep(800)

    if (action === "type") {
      await el.clear()
      await driver.sleep(500)
      
for (const char of value) {
  await el.sendKeys(char)
  await driver.sleep(100) // typing humain ✅
}

      await driver.sleep(800)
    }

    if (action === "click") {
      try {
        await el.click()
      } catch {
        await driver.executeScript("arguments[0].click();", el)
      }
      await driver.sleep(800)
    }

    // ✅ screenshot IMPORTANT
    const shot = await captureStepScreenshot(
      driver,
      `${stepIndex}-${i}`,
      action
    )

    screenshots.push(shot)

    addLog(ctx.logs, stepIndex, "SUCCESS", "Action executed", {
      action,
      selector,
      value
    })

  } catch (err) {

    const errorShot = await captureStepScreenshot(
      driver,
      `${stepIndex}-${i}`,
      "error"
    )

    screenshots.push(errorShot)

    addLog(ctx.logs, stepIndex, "ERROR", "Action failed", {
      selector,
      error: err.message
    })
  }
}


// ✅ VALIDATION APRÈS TOUTES LES ACTIONS
//

const pageState = await driver.executeScript(() => {
  return {
    url: window.location.href,
    title: document.title,
    text: document.body.innerText.slice(0, 2000)
  }
})

const validation = await axios.post(
  "http://localhost:8000/ai/validate",
  {
    step: step,
    result: pageState,
    expected: ctx.testCase.expected_result
  }
)

const aiValidation = validation.data

addLog(ctx.logs, stepIndex, "INFO", "AI Validation", aiValidation)

//
// ✅ DECISION FINALE
//

const hasExecError = ctx.logs.some(
  log => log.level === "ERROR" && log.stepIndex === stepIndex
)

if (hasExecError) {
  return {
    status: 'failed_execution',
    screenshots
  }
}

if (aiValidation.status !== "passed") {
  return {
    status: 'failed_assertion',
    screenshots
  }
}

return {
  status: 'passed',
  screenshots,
  actual: pageState
}

  } catch (err) {

    addLog(ctx.logs, stepIndex, "ERROR", "Step failed", {
      error: err.message
    })

    return {
      status: 'failed_execution',
      error: err.message,
      screenshots: []
    }
  }
}

module.exports = { runStructuredUiStep }