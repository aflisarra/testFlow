const { createDriver } = require('./driver.factory')
const { runStructuredUiStep } = require('./ui.executor')
const { addLog } = require('../../utils/logger')

async function runTestCase(testCase) {
  const { captureStepScreenshot } = require('../../utils/screenshot')
const { By } = require('selenium-webdriver')
console.log("✅ TESTCASE RECEIVED:", JSON.stringify(testCase, null, 2))
  const driver = await createDriver()

  const logs = []
  const stepResults = []

  addLog(logs, 0, "INFO", "Execution started")

  const ctx = {
    baseUrl: testCase.url,
    logs
  }

  try {

   

let steps = Array.isArray(testCase?.executionModel?.steps)
  ? testCase.executionModel.steps
  : []



    // ✅ FALLBACK SI STEP NON STRUCTURÉ
    if (!steps.length && Array.isArray(testCase.steps)) {
steps = testCase.steps.map((raw, i) => {

  const text = String(raw).toLowerCase()

  // ✅ NAVIGATION
  if (i === 0 || text.includes('navigate')) {

    const cleanUrl = String(testCase.url || '')
      .replace(/(https?:\/\/.*?)(https?:\/\/.*)/, '$1')
      .trim()

    return {
      action: 'navigate',

      raw,

      target: {
        url: cleanUrl
      }
    }
  }

  // ✅ SUBMIT
  if (
    text.includes('submit') ||
    text.includes('click')
  ) {

    return {
      action: 'click',

      raw,

      target: {
        selector: '#submit',
        by: 'css'
      }
    }
  }

  // ✅ FORM FILLING
  if (
    text.includes('fill') ||
    text.includes('mandatory')
  ) {

    return {
      action: 'type',

      raw,

      fields: [

        {
          selector: '#firstName',
          by: 'css',
          value: 'Sarra'
        },

        {
          selector: '#lastName',
          by: 'css',
          value: 'AFLI'
        },

        {
          selector: '#userEmail',
          by: 'css',
          value: 'sarra@test.com'
        },

        {
          selector: '#userNumber',
          by: 'css',
          value: '5512345612'
        },

        {
          selector: '#currentAddress',
          by: 'css',
          value: 'Tunis'
        }
      ],

      radios: [
        {
          selector: "label[for='gender-radio-2']",
          by: "css"
        }
      ],

      checkboxes: [
        {
          selector: "label[for='hobbies-checkbox-1']",
          by: "css"
        }
      ],

      uploads: [
        {
          selector: "#uploadPicture",
          by: "css",
          path: "C:\\Users\\MSI\\Desktop\\user2.png"
        }
      ],

      selects: [
        {
          selector: "#react-select-3-input",
          by: "css",
          value: "NCR"
        },

        {
          selector: "#react-select-4-input",
          by: "css",
          value: "Delhi"
        }
      ]
    }
  }

  return {
    action: 'unknown',
    raw
  }
})
    }

    console.log("🔥 STEPS:", steps)

for (let i = 0; i < steps.length; i++) {

  
const step = steps[i]

  console.log(`\n➡️ STEP ${i + 1}: ${step.raw}`)


  try {

    const result =
      await runStructuredUiStep(driver, step, ctx, i + 1)
      console.log(`STATUS: ${result?.status}`)

    stepResults.push({
  index: i + 1,
  name: step.raw,
  action: step.action,

  status: result?.status || 'passed',

  // ✅ IMPORTANT
  screenshots: Array.isArray(result?.screenshots)
    ? result.screenshots
    : [],

  actualResult: result?.actual || '',
  expectedResult: result?.expected || '',

  error: result?.error || ''
})

    if (
      result?.status === 'failed_execution' ||
      result?.status === 'failed_assertion'
    ) {
     
if (
  result &&
  (
    result.status === 'failed_execution' ||
    result.status === 'failed_assertion'
  )
) {
  throw new Error(result.error || 'Step failed')
}

    }

  } catch (err) {

    stepResults.push({

      index: i + 1,
      name: step.raw,

      status: 'failed_execution',

      error: err.message,

    screenshots: [
  await captureStepScreenshot(
    driver,
    i + 1,
    'error'
  )
]
    })

    return {
      status: 'failed_execution',
      logs,
      stepResults
    }
  }
  
  //console.log(`STATUS: ${result?.status}`)
}

let finalStatus = 'passed'

// ✅ ASSERTION GLOBALE
if (testCase.expected_result) {

  try {

    const bodyText = await driver.findElement(By.css('body')).getText()

    console.log(`\n🧪 GLOBAL ASSERT`)
    console.log(`EXPECTED: ${testCase.expected_result}`)
    console.log(`ACTUAL: ${bodyText}`)

    const isMatch = bodyText.includes(testCase.expected_result)

    if (!isMatch) {

  console.log(`❌ GLOBAL ASSERT FAILED`)

  finalStatus = 'failed_assertion'

  addLog(ctx.logs, steps.length + 1, "FAIL", "Global assertion failed", {
    expected: testCase.expected_result,
    actual: bodyText
  })

  stepResults.push({
    index: steps.length + 1,
    name: 'Global Assertion',
    status: 'failed_assertion',
    expectedResult: testCase.expected_result,
    actualResult: bodyText,
    error: 'Expected result NOT found in page',
    screenshots: [
      await captureStepScreenshot(driver, steps.length + 1, 'assertion')
    ]
  })
} else {

      console.log(`✅ GLOBAL ASSERT PASSED`)
    }

  } catch (e) {

    console.log(`❌ ASSERT ERROR: ${e.message}`)

    finalStatus = 'failed_execution'
  }
}


    addLog(logs, steps.length, "SUCCESS", "Test finished")

console.log(`\n🏁 FINAL TEST STATUS: ${finalStatus.toUpperCase()}`)
return {
  status: finalStatus,
  logs,
  stepResults
}


  } catch (err) {

    addLog(logs, 999, "ERROR", err.message)

    return {
      status: 'failed',
      logs,
      stepResults
    }

  } finally {

    await new Promise(r => setTimeout(r, 2000))
    await driver.quit()

  }
}

module.exports = { runTestCase }
