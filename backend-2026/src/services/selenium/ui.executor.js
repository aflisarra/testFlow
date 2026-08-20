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

      // driver.get() requires a fully-qualified URL with a protocol.
      // A bare hostname like "google.com" causes Chrome to navigate to
      // "data:,google.com" instead of the intended page, making the DOM
      // wait time out. Normalise to https:// when no protocol is present.
      const rawUrl = String(ctx.baseUrl || '').trim()
      const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
      if (url !== rawUrl) {
        console.warn(`⚠️ URL had no protocol — normalised to: ${url}`)
      }
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
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.top <= window.innerHeight &&
          rect.left <= window.innerWidth
        )
      }

      return Array.from(document.querySelectorAll('input, button, a, textarea, select, [role="button"], [role="link"], [role="option"], [role="combobox"]'))
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
          ariaHaspopup: el.getAttribute('aria-haspopup') || "",
          ariaExpanded: el.getAttribute('aria-expanded') || "",
          role: el.getAttribute('role') || "",
          title: el.getAttribute('title') || "",
          value: el.value || "",
          classes: typeof el.className === 'string' ? el.className : "",
          disabled: Boolean(el.disabled),
          visible: isVisible(el),
          rect: getRect(el),
          href: el.getAttribute('href') || "",
          form: el.form?.getAttribute('id') || el.form?.getAttribute('name') || "",
          businessRole: (() => {

  const metadata = [
    el.id,
    el.name,
    el.placeholder,
    el.getAttribute('aria-label'),
    el.getAttribute('title')
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const rules = [
    { key: 'email', role: 'email' },
    { key: 'password', role: 'password' },
    { key: 'country', role: 'country' },
    { key: 'username', role: 'username' },
    { key: 'login', role: 'username' },
    { key: 'phone', role: 'phone' },
    { key: 'mobile', role: 'phone' },
  ]

  const match = rules.find(r => metadata.includes(r.key))

  return match?.role || null

})(),
        }))
        .filter(el => el.visible)
    })

    console.log("📦 DOM:", elements)
    const domSourceUrl = await driver.getCurrentUrl().catch(() => '')
    addLog(ctx.logs, stepIndex, "INFO", "DOM captured", {
      elements: elements.length,
      dom: elements,
      sourceUrl: domSourceUrl
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
      ctx.executionMemory ??= {
  executed_actions: [],
  filled_fields: [],
  selected_dropdowns: [],
  checked_checkboxes: []
}

const structuredTestCase = {
  id: ctx.testCase?.id || "",
  title: ctx.testCase?.title || "",
  url: ctx.testCase?.url || "",
  steps: Array.isArray(ctx.testCase?.steps)
    ? ctx.testCase.steps
    : [],
  test_data:
    ctx.testCase?.test_data ||
    ctx.testCase?.testData ||
    [],
  execution_memory: ctx.executionMemory,
  current_step_index: stepIndex,
  current_step: step
}

      console.log('[ui.executor] ai payload', {
        id: structuredTestCase.id,
        hasTestData: Array.isArray(structuredTestCase.test_data),
        testDataCount: Array.isArray(structuredTestCase.test_data) ? structuredTestCase.test_data.length : 0,
        hasCredentials: Boolean(structuredTestCase.credentials),
      })
      
console.log(
  "🧠 EXECUTION MEMORY:",
  JSON.stringify(
    ctx.executionMemory,
    null,
    2
  )
)


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
    ctx.seleniumCode =
       payload?.selenium_code || ''

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

    const overrideActions = Array.isArray(ctx.actionOverrides?.[stepIndex])
      ? ctx.actionOverrides[stepIndex]
      : []

    if (overrideActions.length) {
      actions = overrideActions
        .map((a) => ({
          type: String(a?.type || a?.action || '').trim(),
          selector: String(a?.selector || '').trim(),
          value: String(a?.value || '').trim(),
        }))
        .filter((a) => a.type && a.selector)

      addLog(ctx.logs, stepIndex, "INFO", "AI actions overridden by user", {
        source: "backend-2026:user_override",
        actions,
        originalActions: decisions
      })
    }

    if (actions.length === 0) {
      console.log("⚠️ AI RETURNED EMPTY → FAIL")
      return {
        status: 'failed_execution',
        error: 'AI returned no actions',
        screenshots: []
      }
    }

    console.log("🧠 ACTIONS:", actions)
    addLog(ctx.logs, stepIndex, "INFO", "AI actions received", {
      source: overrideActions.length ? "backend-2026:user_override" : "python-2026:/ai/decide",
      actions
    })

    const screenshots = []
    const domElementsByIndex = new Map()

for (const item of elements) {
  domElementsByIndex.set(item.index, item)
}
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

      if (normalized.startsWith("id=")) {
        return driver.findElement(By.id(normalized.replace("id=", "")))
      }
      if (normalized.startsWith("name=")) {
        return driver.findElement(By.name(normalized.replace("name=", "")))
      }
      if (normalized.startsWith("__index:")) {

  const rawIndex = Number(
    normalized.slice("__index:".length)
  )

  const metadata = domElementsByIndex.get(rawIndex)

  console.log(
    "INDEX LOOKUP",
    rawIndex,
    metadata?.text
  )

  if (!metadata) {
    return null
  }

  if (metadata.id) {
    return driver.findElement(By.id(metadata.id))
  }

  if (metadata.name) {
    return driver.findElement(By.name(metadata.name))
  }

  if (metadata.text) {
    return resolveTextSelector(
      driver,
      `text=${metadata.text}`
    )
  }

  return null
}

      if (normalized.startsWith("text=")) {
        return resolveTextSelector(driver, normalized)
      }

      if (normalized.startsWith("#") && normalized.includes("[")) {
        const literalId = normalized.slice(1)
        const byId = await driver.findElements(By.id(literalId)).catch(() => [])
        if (byId.length > 0) {
          return byId[0]
        }
        return driver.executeScript((id) => document.getElementById(id), literalId)
      }

      const byId = await driver.findElements(By.id(normalized.replace(/^#/, ""))).catch(() => [])
      if (byId.length > 0) return byId[0]

      const byName = await driver.findElements(By.name(normalized.replace(/^name=/, ""))).catch(() => [])
      if (byName.length > 0 && normalized.startsWith("name=")) return byName[0]

      return driver.findElement(By.css(normalized))
    }

   const resolveTextSelector = async (driverInstance, selector) => {
  const value = String(selector || "").replace(/^text=/, "").trim()
  if (!value) return null

  const xpath = `//*[contains(normalize-space(.), ${JSON.stringify(value)})]`
  const candidates = await driverInstance.findElements(By.xpath(xpath))

  // ✅ Prefer genuinely interactive, leaf-level elements (button, link,
  // input, role=button) whose OWN text matches exactly, over generic
  // wrapper containers that only match because a descendant contains
  // the text (ancestors come first in XPath document order, so without
  // this we'd click a <div> wrapper instead of the real <button>).
  const interactiveTags = new Set(['button', 'a', 'input'])
  const scored = []

  for (const candidate of candidates) {
    if (!(await isVisibleElement(candidate))) continue

    const tag = String(await candidate.getTagName().catch(() => '') || '').toLowerCase()
    const role = String(await candidate.getAttribute('role').catch(() => '') || '').toLowerCase()
    const ownText = normalizeValue(await candidate.getText().catch(() => ''))
    const isInteractive = interactiveTags.has(tag) || role === 'button' || role === 'link'
    const isExactMatch = ownText === normalizeValue(value)

    let score = 0
    if (isInteractive) score += 100
    if (isExactMatch) score += 50
    scored.push({ el: candidate, score })
  }

  if (!scored.length) return null

  scored.sort((a, b) => b.score - a.score)
  return scored[0].el
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
            rect.height > 0 &&
            rect.bottom >= 0 &&
            rect.right >= 0 &&
            rect.top <= window.innerHeight &&
            rect.left <= window.innerWidth
          )
        }, el)
      } catch (_) {
        return false
      }
    }

    const classifyElement = async (el) => {
  const tag = String(
    await el.getTagName().catch(() => '')
  ).toLowerCase()

  const role = String(
    await el.getAttribute('role').catch(() => '')
  ).toLowerCase()

  const type = String(
    await el.getAttribute('type').catch(() => '')
  ).toLowerCase()

  const ariaHaspopup = String(
    await el.getAttribute('aria-haspopup').catch(() => '')
  ).toLowerCase()

  const insideForm = await driver.executeScript(
    element => !!element.closest('form'),
    el
  ).catch(() => false)

 const isDropdown =
  tag === 'select' ||
  role === 'combobox' ||
  role === 'listbox' ||
  ['listbox', 'dialog', 'menu']
    .includes(ariaHaspopup) 
    

  const isSubmit =
    type === 'submit' ||
    (
      tag === 'button' &&
      insideForm &&
      !isDropdown
    )

  const isCheckbox =
    tag === 'input' &&
    type === 'checkbox'

  const isRadio =
    tag === 'input' &&
    type === 'radio'

  return {
    isDropdown,
    isSubmit,
    isCheckbox,
    isRadio,
    tag,
    role,
    type
  }
}
    const getDropdownText = async (el) => {
      if (!el) return ''
      try {
        return normalizeValue(await el.getText())
      } catch (_) {
        return ''
      }
    }

    const getDropdownHint = async (el) => {
      try {
        const hint = await driver.executeScript((element) => {
          if (!element) return ''
          const attrs = [
            element.id,
            element.getAttribute('name'),
            element.getAttribute('aria-label'),
            element.getAttribute('aria-labelledby'),
            element.getAttribute('title'),
            element.getAttribute('placeholder'),
            element.getAttribute('data-testid'),
            element.className
          ]
            .filter(Boolean)
            .join(' ')
          const parentText = element.parentElement ? (element.parentElement.innerText || '') : ''
          return `${attrs} ${parentText}`.replace(/\s+/g, ' ').trim()
        }, el)
        return normalizeValue(hint)
      } catch (_) {
        return ''
      }
    }

    const scoreDropdownCandidate = async (candidate, label) => {
      const wanted = normalizeValue(label)
      if (!wanted) return 0

      const tag = String(await candidate.getTagName().catch(() => '') || '').toLowerCase()
  const role = String(await candidate.getAttribute('role').catch(() => '') || '').toLowerCase()
  const ariaHaspopup = String(await candidate.getAttribute('aria-haspopup').catch(() => '') || '').toLowerCase()
  const ariaExpanded = String(await candidate.getAttribute('aria-expanded').catch(() => '') || '').toLowerCase()
  const type = String(await candidate.getAttribute('type').catch(() => '') || '').toLowerCase()
  const text = normalizeValue(await getDropdownText(candidate))
  const hint = normalizeValue(await getDropdownHint(candidate))

      let score = 0

      if (tag === 'select') score += 100
      if (role === 'combobox') score += 95
      if (role === 'listbox') score += 90
      if (ariaHaspopup === 'listbox') score += 85
      if (ariaExpanded === 'true') score += 60
      if (tag === 'input' && ['search', 'text'].includes(type)) score += 50
      if (tag === 'button') score += 30
      if (tag === 'div') score += 10

      if (text && text === wanted) score += 80
      if (text && (text.includes(wanted) || wanted.includes(text))) score += 50
      if (hint && hint.includes(wanted)) score += 40

      return score
    }

    const getDropdownCandidates = async () => {
      const selector =
        'select, [role="combobox"], [role="listbox"], [aria-haspopup="listbox"], [aria-expanded], button, input, div'
      const els = await driver.findElements(By.css(selector))
      const candidates = []
      for (const el of els) {
        if (await isVisibleElement(el)) {
          candidates.push(el)
        }
      }
      return candidates
    }

    const isDropdownTrigger = async (el) => {
      try {
        const tag = String(await el.getTagName().catch(() => '') || '').toLowerCase()
        const role = String(await el.getAttribute('role').catch(() => '') || '').toLowerCase()
        const ariaHaspopup = String(await el.getAttribute('aria-haspopup').catch(() => '') || '').toLowerCase()
        const ariaExpanded = String(await el.getAttribute('aria-expanded').catch(() => '') || '').toLowerCase()
        const type = String(await el.getAttribute('type').catch(() => '') || '').toLowerCase()
        const text = await getDropdownText(el)
        return Boolean(
          tag === 'select' ||
          role === 'combobox' ||
          role === 'listbox' ||
          ariaHaspopup === 'listbox' ||
           [
   'listbox',
   'dialog',
   'menu',
   'true'
 ].includes(ariaHaspopup) ||
          ariaExpanded === 'true' ||
          (tag === 'button' && text) ||
          (tag === 'input' && ['search', 'text'].includes(type)) ||
          (tag === 'div' && (role || ariaHaspopup || ariaExpanded))
        )
      } catch (_) {
        return false
      }
    }

const openDropdown = async (preferredEl, label) => {
  const candidates = await getDropdownCandidates()
  const scored = []

  if (preferredEl && await isVisibleElement(preferredEl)) {
    scored.push({
      el: preferredEl,
      score: (await scoreDropdownCandidate(preferredEl, label)) + 20
    })
  }

  for (const candidate of candidates) {
    if (!(await isDropdownTrigger(candidate))) continue
    scored.push({
      el: candidate,
      score: await scoreDropdownCandidate(candidate, label)
    })
  }

  scored.sort((a, b) => b.score - a.score)

  for (const item of scored) {
    const candidate = item.el

    console.log("Trying dropdown candidate:", await getDropdownText(candidate), "score:", item.score)

    await driver.executeScript((element) => {
      element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
    }, candidate).catch(() => {})

    await sleep(150)

    try {
      await safeClick(candidate)
      console.log("✅ DROPDOWN OPEN CLICK:", await getDropdownText(candidate))
      await sleep(800)

      // ✅ Attendre le dialog
      try {
        await driver.wait(async () => {
          const dialogs = await driver.findElements(
            By.css('[role="dialog"], [role="listbox"], [aria-modal="true"]')
          )
          for (const d of dialogs) {
            if (await isVisibleElement(d)) return true
          }
          return false
        }, 5000)
        console.log("✅ Dialog opened")
      } catch (_) {
        console.log("⚠️ No dialog detected, continuing")
      }

      const expandedAfter = String(
        await candidate.getAttribute('aria-expanded').catch(() => '')
      ).toLowerCase()
      console.log("aria-expanded after click:", expandedAfter)

      return candidate

    } catch (err) {
      console.log("❌ DROPDOWN CLICK FAILED:", err.message)
    }
  }

  return null
}

    const getVisibleOptions = async () => {
  const selectors = [
    '[role="option"]',
    'option',
    '[role="menuitem"]',
    '[role="treeitem"]',
    '[role="radio"]',
    // ✅ GitHub country dialog : items sont des <li> ou <div> dans le dialog
    '[role="dialog"] li',
    '[role="dialog"] [data-value]',
    '[aria-modal="true"] li',
    '[aria-modal="true"] button',
    '.tv-dd-option',
    '.tv-dropdown button',
    '[data-value]',
    '[data-testid*="option" i]',
  ].join(', ')

  const els = await driver.findElements(By.css(selectors))
  const visible = []
  for (const el of els) {
    if (await isVisibleElement(el)) visible.push(el)
  }
  return visible
}


const getSearchInputInDialog = async (timeoutMs = 3000) => {
  const selectors = [
    '[role="dialog"] input',
    '[aria-modal="true"] input',
    'input[type="search"]',
    'input[role="searchbox"]',
    'input[aria-label*="search" i]',
    'input[placeholder*="Search" i]',
    'input[placeholder*="Find" i]',
    'input[placeholder*="Filter" i]',
    'input[placeholder*="Type" i]',
  ]
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    for (const sel of selectors) {
      const inputs = await driver.findElements(By.css(sel))
      for (const input of inputs) {
        if (await isVisibleElement(input)) return input
      }
    }
    await sleep(200)
  }
  return null
}

const selectViaSearchDialog = async (wanted) => {
  console.log("🔍 Looking for search input for:", wanted)
  const searchInput = await getSearchInputInDialog(3000)

  if (searchInput) {
    console.log("✅ Search input found, typing:", wanted)
    await driver.executeScript((el) => el.focus(), searchInput)
    await sleep(200)
    await searchInput.clear().catch(() => {})
    await searchInput.sendKeys(wanted)
    await sleep(800) // laisser le filtre s'appliquer
  } else {
    console.log("⚠️ No search input found → will scroll and search visually")
  }

  // Que la recherche ait été utilisée ou non, on cherche ensuite
  // l'option correspondant exactement au texte recherché.
  let option = await findOptionByText(wanted)
  if (!option) option = await findGenericDropdownOptionByText(wanted)
  if (!option) option = await waitForOptionText(wanted, 5000)

  return option
}
    const getGenericVisibleTextNodes = async () => {
      const selectors = [
        'div',
        'span',
        'li',
        'button',
        'a',
        '[role]',
        '[data-value]',
        '[data-testid]'
      ].join(', ')
      const els = await driver.findElements(By.css(selectors))
      const visible = []
      for (const el of els) {
        if (!(await isVisibleElement(el))) continue
        const text = await getOptionText(el)
        if (text) visible.push(el)
      }
      return visible
    }

    const getOptionText = async (el) => {
      try {
        const text = normalizeValue(await el.getText())
        if (text) return text
      } catch (_) {}
      try {
        return normalizeValue(await el.getAttribute('aria-label'))
      } catch (_) {
        return ''
      }
    }

    const scrollOptionContainer = async (option) => {
      try {
        await driver.executeScript((element) => {
          let node = element
          while (node && node !== document.body) {
            const style = window.getComputedStyle(node)
            const canScroll = /(auto|scroll)/.test(`${style.overflow} ${style.overflowY} ${style.overflowX}`)
            if (canScroll && node.scrollHeight > node.clientHeight) {
              node.scrollTop = Math.min(node.scrollTop + Math.max(120, node.clientHeight * 0.8), node.scrollHeight)
              return
            }
            node = node.parentElement
          }
          window.scrollBy(0, Math.max(120, window.innerHeight * 0.6))
        }, option)
        return true
      } catch (_) {
        return false
      }
    }

    const findOptionByText = async (value) => {
      const wanted = normalizeValue(value)
      const maxRounds = 12
      for (let round = 0; round < maxRounds; round++) {
        const options = await getVisibleOptions()
        for (const option of options) {
          const text = await getOptionText(option)
          if (normalizeValue(text) === wanted) {
            return option
          }
        }
        if (!options.length) break
        const last = options[options.length - 1]
        await scrollOptionContainer(last)
        await sleep(250)
      }
      return null
    }

    const findGenericDropdownOptionByText = async (value) => {
      const wanted = normalizeValue(value)
      const maxRounds = 12
      for (let round = 0; round < maxRounds; round++) {
        const nodes = await getGenericVisibleTextNodes()
        for (const node of nodes) {
          const text = await getOptionText(node)
          if (normalizeValue(text) === wanted) {
            return node
          }
        }

        
console.log(
  "Searching generic option:",
  wanted
)

        if (!nodes.length) break
        const last = nodes[nodes.length - 1]
        await scrollOptionContainer(last)
        await sleep(250)
      }
      


      return null

      
    }

    const waitForOptionText = async (value, timeoutMs = 5000) => {
      const started = Date.now()
      while (Date.now() - started < timeoutMs) {
        const options = await getVisibleOptions()
        for (const option of options) {
          const text = await getOptionText(option)
          if (normalizeValue(text) === normalizeValue(value)) {
            return option
          }
        }
        await sleep(250)
      }
      return null
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
      const isDropdownStep = /select|choose|pick|country|region|dropdown/i.test(String(step || ""))

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
        let el = await resolveElementBySelector(selector).catch(() => null)

        if (!el) {
          const wantedText = selector.startsWith("text=")
            ? normalizeValue(selector.replace(/^text=/, ""))
            : normalizeValue(value)

          if (action === "click" && wantedText && isDropdownStep) {
            addLog(ctx.logs, stepIndex, "INFO", "Option not visible before dropdown open; opening dropdown first", {
              selector,
              value: wantedText
            })

            const trigger = await openDropdown(null, wantedText)
            if (!trigger) {
              throw new Error("Dropdown trigger not found for option: " + wantedText)
            }

            await sleep(1000)

            let option = await selectViaSearchDialog(wantedText)
            if (!option) option = await findOptionByText(wantedText)
            if (!option) option = await findGenericDropdownOptionByText(wantedText)
            if (!option) option = await waitForOptionText(wantedText, 5000)

            if (!option) {
              throw new Error(`Dropdown option "${wantedText}" not found`)
            }

            await driver.executeScript((optionEl) => {
              optionEl.scrollIntoView({ block: "center" })
            }, option)
            await safeClick(option)

            ctx.executionMemory.executed_actions.push({
              action: "select",
              selector,
              value: wantedText
            })
            ctx.executionMemory.selected_dropdowns.push({
              selector,
              value: wantedText
            })

            addLog(ctx.logs, stepIndex, "SUCCESS", "Dropdown option selected", {
              selector,
              value: wantedText
            })
            continue
          }

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
          ctx.executionMemory.filled_fields.push({
  selector,
  value
})

ctx.executionMemory.executed_actions.push({
  action: "type",
  selector,
  value
})
          await sleep(2000)

          const hasValidationError =
  await driver.executeScript((element) => {
    return (
      element.className.includes(
        "is-autocheck-errored"
      )
    )
  }, el)

if (hasValidationError) {
  throw new Error(
    "Validation failed"
  )
}

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

  const clickTarget = el

  const optionValue =
    selector.startsWith("text=")
      ? normalizeValue(
          selector.replace(/^text=/, "")
        )
      : normalizeValue(value)

  const info = await classifyElement(clickTarget)

if (info.isSubmit) {

  console.log(
    "✅ SUBMIT BUTTON DETECTED"
  )

  // Explicit wait: ensure the Login/submit button is actually visible
  // before clicking it, instead of relying on the earlier isVisibleElement()
  // snapshot which can go stale if Angular/React re-renders the form.
  try {
    await driver.wait(until.elementIsVisible(clickTarget), 10000)
  } catch (waitErr) {
    throw new Error(
      `Login button was not visible within 10s: ${waitErr.message}`
    )
  }

  await safeClick(clickTarget)

  ctx.executionMemory.executed_actions.push({
    action: "click",
    selector
  })

  break
}

  const isDropdownSelection =
    info.isDropdown

  if (isDropdownSelection) {

    const wanted =
      optionValue || value || ""

    if (!wanted) {
      console.log(
        "⚠️ No dropdown value, simple click"
      )

      await safeClick(clickTarget)
      continue
    }

    console.log(
      "🎯 DROPDOWN VALUE:",
      wanted
    )

    const trigger =
      await openDropdown(
        clickTarget,
        wanted
      )

    if (!trigger) {
      throw new Error(
        "Dropdown trigger not found"
      )
    }

    await sleep(1000)

    let option =
      await selectViaSearchDialog(
        wanted
      )

    if (!option)
      option =
        await findOptionByText(
          wanted
        )

    if (!option)
      option =
        await findGenericDropdownOptionByText(
          wanted
        )

    if (!option)
      option =
        await waitForOptionText(
          wanted,
          5000
        )

    if (!option) {
      throw new Error(
        `Dropdown option "${wanted}" not found`
      )
    }

    await driver.executeScript(
      el => {
        el.scrollIntoView({
          block: "center"
        })
      },
      option
    )

    await safeClick(option)

    ctx.executionMemory.executed_actions.push({
      action: "select",
      selector,
      value: wanted
    })

    console.log(
      "✅ OPTION SELECTED:",
      wanted
    )

    continue
  }

  // clic normal

  await safeClick(clickTarget)


addLog(
  ctx.logs,
  stepIndex,
  'INFO',
  'AI response',
  {
    actions,
    seleniumCode:
      payload?.selenium_code || ''
  }
)


  try {

    await driver.wait(
      async () => {

        const url =
          await driver.getCurrentUrl()

        return !String(url || "")
          .includes("/auth/login")

      },
      18000
    )

  } catch (_) {

    try {

      await driver.wait(
        until.stalenessOf(
          clickTarget
        ),
        8000
      )

    } catch (_) {}

  }

  if (
    isSubmitLikeSelector(
      selector
    )
  ) {
    break
  }
}

        if (action === "press" && value) {
          await sleep(300)
          await el.sendKeys(value)
          ctx.executionMemory.filled_fields.push({
  selector,
  value
})

ctx.executionMemory.executed_actions.push({
  action: "type",
  selector,
  value
})
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

      }  catch (err) {
  console.log("❌ ACTION ERROR:", err.message)
  console.log("❌ ACTION ERROR STACK:", err.stack)

  addLog(ctx.logs, stepIndex, "ERROR", "Action failed", {
    selector,
    action,
    value,
    error: err.message,
    stack: err.stack,
    elapsedMs: Date.now() - actionStartedAt
  })
  return {
    status: 'failed_execution',
    error: err.message,
    errorDetails: {
      message: err.message,
      stack: err.stack,
      selector,
      action,
      value,
    },
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
