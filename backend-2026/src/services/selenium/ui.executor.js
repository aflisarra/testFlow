const { By, until, Select } = require('selenium-webdriver')
const axios = require('axios')

const { captureStepScreenshot } = require('../../utils/screenshot')
const { highlightElement } = require('../../utils/visual')
const { addLog } = require('../../utils/logger')

async function runStructuredUiStep(driver, step, ctx, stepIndex) {
  const sleep = (ms) => driver.sleep(ms)

  try {

    // ✅ STEP 1: OPEN PAGE
    if (stepIndex === 1) {

      const url = ctx.baseUrl
      console.log("🌍 OPEN:", url)

      try {
        await driver.get(url)
      } catch (err) {
        // Some pages finish rendering after the browser's page-load event.
        // We keep going and confirm readiness with an explicit DOM wait below.
        console.warn("⚠️ driver.get timeout/renderer delay:", err.message)
      }

      // ✅ wait true DOM (Angular)
      await driver.wait(async () => {
        const ready = await driver.executeScript(() => document.readyState)
        if (ready !== 'complete' && ready !== 'interactive') {
          return false
        }
        const inputs = await driver.findElements(
          By.css('input, button, a, textarea, select, [role="button"], [role="link"]')
        )
        return inputs.length > 0
      }, 30000)

      await driver.sleep(1500)

      const screenshot = await captureStepScreenshot(driver, stepIndex, "open")

      addLog(ctx.logs, stepIndex, "INFO", "Page opened", { url })

      return {
        status: 'passed',
        screenshots: [screenshot]
      }
    }

    // ✅ GET DOM (richer snapshot for AI and debugging)
    const elements = await driver.executeScript(() => {

      function getVisibleText(el) {
        return el.innerText?.replace(/\s+/g, " ").trim() || ""
      }

      function getRect(el) {
        const rect = el.getBoundingClientRect()
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      }

      function isVisible(el) {
        const style = window.getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return Boolean(
          style &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 0 &&
          rect.height > 0
        )
      }

      return Array.from(document.querySelectorAll('input, button, a, textarea, select, [role="button"], [role="link"]'))
        .map((el, index) => ({
          index,
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          name: el.name || "",
          testId: el.getAttribute('data-testid') || "",
          type: el.type || "",
          placeholder: el.placeholder || "",
          text: getVisibleText(el),
          ariaLabel: el.getAttribute('aria-label') || "",
          role: el.getAttribute('role') || "",
          title: el.getAttribute('title') || "",
          value: el.value || "",
          classes: typeof el.className === 'string' ? el.className : "",
          disabled: Boolean(el.disabled),
          visible: isVisible(el),
          rect: getRect(el),
          href: el.getAttribute('href') || "",
          form: el.form?.getAttribute('id') || el.form?.getAttribute('name') || ""
        }))
        .filter(el => el.visible || el.tag !== "a" || el.text.length > 0)
    })

    console.log("📦 DOM:", elements)
    addLog(ctx.logs, stepIndex, "INFO", "DOM captured", {
      elements: elements.length,
      sample: elements.slice(0, 12)
    })

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
      const structuredTestCase = {
        id: ctx.testCase?.id || "",
        title: ctx.testCase?.title || "",
        url: ctx.testCase?.url || ctx.testCase?.urlCible || ctx.baseUrl || "",
        steps: Array.isArray(ctx.testCase?.steps) ? ctx.testCase.steps : [],
        test_data:
          ctx.testCase?.test_data ||
          ctx.testCase?.testData ||
          ctx.testCase?.data ||
          ctx.testCase?.credentials ||
          [],
        credentials: ctx.testCase?.credentials || null,
        executionModel: ctx.testCase?.executionModel || null,
        current_step_index: stepIndex,
        current_step: step
      }

      console.log('[ui.executor] ai payload', {
        id: structuredTestCase.id,
        hasTestData: Array.isArray(structuredTestCase.test_data),
        testDataCount: Array.isArray(structuredTestCase.test_data) ? structuredTestCase.test_data.length : 0,
        hasCredentials: Boolean(structuredTestCase.credentials),
      })

      resp = await axios.post(
        "http://localhost:8000/ai/decide",
        {
          step,
          dom: elements,
          test_case: structuredTestCase
        },
        { timeout: 60000 }
      )
    } catch (err) {
      console.log("❌ AI ERROR:", err.message)
      resp = { data: [] }
    }

    const payload = resp?.data ?? {}
    const decisions = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.actions)
          ? payload.actions
        : []

    const rawTestData =
      ctx.testCase?.test_data ||
      ctx.testCase?.testData ||
      ctx.testCase?.data ||
      ctx.testCase?.credentials ||
      []

    const testDataValues = Array.isArray(rawTestData)
      ? rawTestData
          .map((item) => {
            if (typeof item === 'string') {
              // Support a single string carrying multiple credentials on
              // separate lines, e.g. "Admin\nadmin123".
              return item
                .replace(/\r/g, '\n')
                .split('\n')
                .map((part) => part.trim())
                .filter(Boolean)
            }
            if (item && typeof item === 'object') {
              return String(
                item.value ||
                item.text ||
                item.password ||
                item.username ||
                item.email ||
                item.token ||
                ''
              ).trim()
            }
            return String(item || '').trim()
          })
          .flat()
          .filter(Boolean)
      : rawTestData && typeof rawTestData === 'object'
        ? Object.values(rawTestData)
            .map((item) =>
              String(item || '')
                .replace(/\r/g, '\n')
                .split('\n')
                .map((part) => part.trim())
                .filter(Boolean)
            )
            .flat()
            .filter(Boolean)
        : []

    let testDataCursor = 0
    const takeNextTestDataValue = () => {
      const next = testDataValues[testDataCursor] || ''
      if (testDataCursor < testDataValues.length - 1) {
        testDataCursor++
      }
      return next
    }

    let actions = decisions.filter((a) =>
      a &&
      typeof a.type === "string" &&
      typeof a.selector === "string" &&
      a.selector.trim().length > 0
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
    addLog(ctx.logs, stepIndex, "INFO", "AI actions received", { actions })

    const screenshots = []
    const indexedElementsSelector = 'input, button, a, textarea, select, [role="button"], [role="link"]'
    const indexedElements = await driver.findElements(By.css(indexedElementsSelector))
    const editableElements = await driver.findElements(By.css('input, textarea, select'))
    const highlightedSelectors = new Set()
    const executedActionKeys = new Set()
    const editableMetadata = elements.filter((el) => {
      const tag = String(el?.tag || "").toLowerCase()
      if (tag === "textarea" || tag === "select") return true
      if (tag !== "input") return false
      const inputType = String(el?.type || "").toLowerCase().trim()
      return (
        !inputType ||
        [
          "text",
          "email",
          "password",
          "number",
          "tel",
          "url",
          "search",
          "date",
          "datetime-local",
          "month",
          "week",
          "time",
          "color",
        ].includes(inputType)
      )
    })

    const resolveElementBySelector = async (selector) => {
      const normalized = String(selector || "").trim()

      if (normalized.startsWith("__index:")) {
        const rawIndex = Number(normalized.slice("__index:".length))
        if (Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < indexedElements.length) {
          // Keep the index mapping identical to DOM capture so AI and executor
          // resolve the exact same element for "__index:N".
          return indexedElements[rawIndex]
        }
        return null
      }

      return driver.findElement(By.css(normalized))
    }

    const normalizeValue = (v) => String(v || "").trim()
    const isSubmitLikeSelector = (selector) => {
      const s = String(selector || "").toLowerCase()
      return (
        s.includes('submit') ||
        s.includes('save') ||
        s.includes('next') ||
        s.includes('continue') ||
        s.includes('login') ||
        s.includes('register')
      )
    }

    const safeClick = async (el) => {
      try {
        await el.click()
        return
      } catch (err) {
        await driver.executeScript((element) => {
          element.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          }))
        }, el)
      }
    }

    const isVisibleElement = async (el) => {
      try {
        return await driver.executeScript((element) => {
          if (!element) return false
          const style = window.getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return Boolean(
            style &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0
          )
        }, el)
      } catch (_) {
        return false
      }
    }

    const closeTransientUi = async () => {
      try {
        await driver.actions({ bridge: true }).sendKeys('\uE00C').perform()
      } catch (_) {}
      try {
        await driver.executeScript(() => {
          const active = document.activeElement
          if (active && typeof active.blur === 'function') active.blur()
        })
      } catch (_) {}
      await sleep(150)
    }

    // ✅ LOOP ACTIONS
    for (let i = 0; i < actions.length; i++) {

      const act = actions[i]
      const action = String(act.type || "").toLowerCase()
      const selector = String(act.selector || "").trim()
      let value = String(act.value || "").trim()
      const actionStartedAt = Date.now()
      const actionKey = `${action}::${selector}::${value}`

      if (executedActionKeys.has(actionKey)) {
        addLog(ctx.logs, stepIndex, "INFO", "Skipping duplicate action", {
          action,
          selector,
          value
        })
        continue
      }
      executedActionKeys.add(actionKey)

      try {
        console.log(`▶️ Action starting [${i + 1}/${actions.length}]`, {
          action,
          selector
        })
        addLog(ctx.logs, stepIndex, "INFO", "Action starting", {
          action,
          selector,
          index: i + 1,
          total: actions.length
        })

        // Small pause before interacting so the UI can settle
        await sleep(500)

        // ✅ FIND ELEMENT BY CSS SELECTOR or DOM index fallback
        const el = await resolveElementBySelector(selector)

        if (!el) {
          throw new Error("Element not found by selector: " + selector)
        }

        await driver.executeScript((element) => {
          element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
        }, el)

        const shouldHighlight = !highlightedSelectors.has(selector)
        if (shouldHighlight) {
          highlightedSelectors.add(selector)
          await highlightElement(driver, el, 1200)
          await sleep(150)

          const highlightShot = await captureStepScreenshot(
            driver,
            `${stepIndex}-${i}-highlight`,
            `${action}-highlight`
          )
          screenshots.push(highlightShot)
        }

        if (action === "type") {
          const inputType = String(await el.getAttribute('type').catch(() => '') || '').toLowerCase().trim()
          const tagName = String(await el.getTagName().catch(() => '') || '').toLowerCase().trim()
          const currentValue = normalizeValue(await el.getAttribute('value').catch(() => ''))
          const alreadyFilled = currentValue.length > 0
          const visible = await isVisibleElement(el)

          if (!visible) {
            addLog(ctx.logs, stepIndex, "WARN", "Skipping non-visible field", {
              selector,
              inputType
            })
            continue
          }

          if (inputType === "checkbox" || inputType === "radio") {
            const checked = await el.isSelected().catch(() => false)
            if (!checked) {
              await sleep(200)
              await safeClick(el)
            } else {
              addLog(ctx.logs, stepIndex, "INFO", "Skipping already-selected choice", {
                selector
              })
            }
            continue
          }
          if (inputType === "file" && !value) {
            addLog(ctx.logs, stepIndex, "WARN", "Skipping file input without value", {
              selector
            })
            continue
          }
          if (!value) {
            value = takeNextTestDataValue()
          }
          if (!value && inputType !== "file") {
            const fallbackIndex = editableMetadata.findIndex((meta) => {
              const candidateSelector = meta?.id
                ? `#${meta.id}`
                : meta?.name
                  ? `[name="${meta.name}"]`
                  : meta?.placeholder
                    ? `[placeholder="${meta.placeholder}"]`
                    : ""
              return candidateSelector && candidateSelector === selector
            })
            if (fallbackIndex >= 0) {
              value = takeNextTestDataValue()
            }
          }
          if (!value && inputType !== "file") {
            value = ""
          }

          if (tagName === "select") {
            // Selects must be handled by Selenium Select instead of typing,
            // otherwise option selection becomes fragile and browser-specific.
            const select = new Select(el)
            try {
              select.selectByVisibleText(value)
            } catch (_) {
              try {
                select.selectByValue(value)
              } catch (selectErr) {
                throw new Error(`Unable to select option "${value}" for ${selector}: ${selectErr.message}`)
              }
            }
            await sleep(500)
            continue
          }

          if (alreadyFilled && currentValue === normalizeValue(value)) {
            addLog(ctx.logs, stepIndex, "INFO", "Skipping already-filled field", {
              selector,
              value: currentValue
            })
            continue
          }

          if (currentValue && currentValue !== normalizeValue(value)) {
            await el.clear().catch(() => {})
            await sleep(150)
          }

          await el.sendKeys(value)
          await sleep(500)

          if (selector === "#subjectsInput") {
            await sleep(500)
            await closeTransientUi()
          }

          if (selector === "#dateOfBirthInput") {
            await sleep(500)
            await closeTransientUi()
          }
        }

        if (action === "click") {
          await sleep(400)
          await safeClick(el)
          console.log("✅ CLICK DONE")
          addLog(ctx.logs, stepIndex, "INFO", "Click dispatched", {
            selector
          })

          try {
            await driver.wait(async () => {
              const url = await driver.getCurrentUrl()
              return !String(url || "").includes('/auth/login')
            }, 18000)
          } catch (_) {
            try {
              await driver.wait(until.stalenessOf(el), 8000)
            } catch (_) {}
          }

          if (isSubmitLikeSelector(selector)) {
            break
          }
        }

        if (action === "press" && value) {
          await sleep(300)
          await el.sendKeys(value)
          await sleep(400)
        }

        if (action === "wait") {
          const waitMs = Number(value) || 1000
          await driver.sleep(waitMs)
        }

        if (action === "scroll") {
          await sleep(300)
          await driver.executeScript((element) => {
            element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
          }, el)
          await sleep(500)
        }

        // Keep a short pause before the post-action screenshot so the UI reflects the action
        await sleep(1000)

        const shot = await captureStepScreenshot(
          driver,
          `${stepIndex}-${i}`,
          `${action}-after`
        )

        screenshots.push(shot)

        addLog(ctx.logs, stepIndex, "SUCCESS", "Action executed", {
          action,
          selector,
          value,
          elapsedMs: Date.now() - actionStartedAt,
          screenshot: shot
        })
        console.log(`✅ Action executed [${i + 1}/${actions.length}]`, {
          action,
          selector,
          elapsedMs: Date.now() - actionStartedAt,
          screenshot: shot
        })

      } catch (err) {

        console.log("❌ ACTION ERROR:", err.message)

        addLog(ctx.logs, stepIndex, "ERROR", "Action failed", {
          selector,
          error: err.message,
          elapsedMs: Date.now() - actionStartedAt
        })
        return {
          status: 'failed_execution',
          error: err.message,
          screenshots
        }
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
