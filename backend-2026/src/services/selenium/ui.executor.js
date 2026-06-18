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

      // ✅ wait true DOM (Angular)
      await driver.wait(
        until.elementLocated(By.css('input[name="username"]')),
        10000
      )

      await driver.sleep(1500)

      const screenshot = await captureStepScreenshot(driver, stepIndex, "open")

      addLog(ctx.logs, stepIndex, "INFO", "Page opened", { url })

      return {
        status: 'passed',
        screenshots: [screenshot]
      }
    }

    // ✅ GET DOM (INDEX-BASED ✅)
    const elements = await driver.executeScript(() => {

      function getVisibleText(el) {
        return el.innerText?.replace(/\s+/g, " ").trim() || ""
      }

      return Array.from(document.querySelectorAll('input, button, a'))
        .map((el, index) => ({
          index,
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          name: el.name || "",
          type: el.type || "",
          placeholder: el.placeholder || "",
          text: getVisibleText(el)
        }))
        .filter(el => el.tag !== "a" || el.text.length > 0)
    })

    console.log("📦 DOM:", elements)

    // ✅ stop if empty DOM
    if (!elements || elements.length === 0) {
      return {
        status: 'failed_execution',
        error: 'Empty DOM',
        screenshots: []
      }
    }

    // ✅ CALL AI
    let resp
    try {
      resp = await axios.post(
        "http://localhost:8000/ai/decide",
        {
          step,
          dom: elements,
          test_case: ctx.testCase
        },
        { timeout: 30000 }
      )
    } catch (err) {
      console.log("❌ AI ERROR:", err.message)
      resp = { data: [] }
    }

    let decisions = resp.data
    let actions = Array.isArray(decisions) ? decisions : [decisions]

    // ✅ VALIDATE ACTIONS (INDEX ONLY ✅)
    actions = actions.filter(a =>
      a &&
      a.action &&
      a.target &&
      typeof a.target.index === "number"
    )

    if (actions.length === 0) {
      console.log("⚠️ AI RETURNED EMPTY → FAIL")
      return {
        status: 'failed_execution',
        error: 'AI returned no actions',
        screenshots: []
      }
    }

    console.log("🧠 ACTIONS:", actions)

    const screenshots = []

    // ✅ LOOP ACTIONS
    for (let i = 0; i < actions.length; i++) {

      const act = actions[i]
      const action = act.action
      const index = act.target.index
      const value = act.value || ""

      try {

        // ✅ FIND ELEMENT BY INDEX (JS DOM ✅)
        const el = await driver.executeScript((i) => {
          return document.querySelectorAll('input, button, a')[i]
        }, index)

        if (!el) {
          throw new Error("Element not found by index: " + index)
        }

        await highlightElement(driver, el)
        await driver.sleep(300)

        // ✅ TYPE
        if (action === "type") {

          await driver.executeScript((i) => {
            const el = document.querySelectorAll('input, button, a')[i]
            el.value = ""
          }, index)

          for (const char of value) {
            await driver.executeScript((i, c) => {
              const el = document.querySelectorAll('input, button, a')[i]
              el.value += c
            }, index, char)

            await driver.sleep(30)
          }

        }

        // ✅ CLICK
        if (action === "click") {

          await driver.executeScript((i) => {
            const el = document.querySelectorAll('input, button, a')[i]
            el.click()
          }, index)

          console.log("✅ CLICK DONE → STOP STEP")

          await driver.sleep(2000)

          const shot = await captureStepScreenshot(
            driver,
            `${stepIndex}-${i}`,
            action
          )

          screenshots.push(shot)

          addLog(ctx.logs, stepIndex, "SUCCESS", "Click executed", {
            index
          })

          break
        }

        const shot = await captureStepScreenshot(
          driver,
          `${stepIndex}-${i}`,
          action
        )

        screenshots.push(shot)

        addLog(ctx.logs, stepIndex, "SUCCESS", "Action executed", {
          action,
          index,
          value
        })

      } catch (err) {

        console.log("❌ ACTION ERROR:", err.message)

        addLog(ctx.logs, stepIndex, "ERROR", "Action failed", {
          index,
          error: err.message
        })
      }
    }

    // ✅ VALIDATION
    const pageState = await driver.executeScript(() => {
      return {
        url: window.location.href,
        title: document.title,
        text: document.body.innerText.slice(0, 1000)
      }
    })

    return {
      status: 'passed',
      screenshots,
      actual: pageState
    }

  } catch (err) {

    console.log("❌ STEP ERROR:", err.message)

    return {
      status: 'failed_execution',
      error: err.message,
      screenshots: []
    }
  }
}

module.exports = { runStructuredUiStep }