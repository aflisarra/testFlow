const fs = require('fs')
const path = require('path')
const { createDriver } = require('./driver.factory')
const { runHumanStep } = require('./ui.executor')
const { runApiStep, isApiStep, resetApiState } = require('./api.executor')
const { describeExecutionStep, resolveExecutionModel } = require('./execution.model')

function getFirstValue(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (normalized) return normalized
  }
  return ''
}

async function captureStepScreenshot(driver, testCase, stepIndex) {
  if (!driver) return null
  const screenshotBase64 = await driver.takeScreenshot()
  const screenshotsDir = path.resolve(__dirname, '..', '..', '..', 'uploads', 'screenshots')
  fs.mkdirSync(screenshotsDir, { recursive: true })

  const testCaseId = String(testCase?.id || testCase?.title || 'test-case')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'test-case'
  const filename = `${testCaseId}-step-${stepIndex}-${Date.now()}.png`
  const absolutePath = path.join(screenshotsDir, filename)

  fs.writeFileSync(absolutePath, screenshotBase64, 'base64')
  // also save page source
  try {
    const pageSource = await driver.getPageSource()
    const domFilename = `${testCaseId}-step-${stepIndex}-${Date.now()}.html`
    const domPath = path.join(screenshotsDir, domFilename)
    fs.writeFileSync(domPath, pageSource, 'utf8')
    return { screenshot: `/api/uploads/screenshots/${filename}`, dom: `/api/uploads/screenshots/${domFilename}` }
  } catch (e) {
    return { screenshot: `/api/uploads/screenshots/${filename}`, dom: null }
  }
}

async function runTestCase(testCase) {
  let driver = null
  const logs = []
  const stepResults = []
  const screenshots = []
  let executionModel = null

  resetApiState()

  function addLog(level, message) {
    logs.push(`[${level}] ${message}`)
  }

  try {
    const rawSteps = testCase.steps || []
    const credentials = testCase.credentials || {}
    const ctx = {
      baseUrl: testCase.url || testCase.urlCible || testCase.targetUrl,
      credentials: {
        email: getFirstValue(
          credentials.email,
          credentials.username,
          credentials.login,
          testCase.email,
          testCase.username,
          testCase.login,
          testCase.userEmail,
          testCase.jiraEmail,
          process.env.APP_LOGIN_EMAIL,
          process.env.TEST_LOGIN_EMAIL,
          process.env.SELENIUM_LOGIN_EMAIL,
          process.env.HTTP_BASIC_AUTH_USERNAME,
          process.env.HTTP_BASIC_AUTH_EMAIL,
          process.env.BASIC_AUTH_USERNAME,
          process.env.BASIC_AUTH_EMAIL,
          process.env.JIRA_EMAIL,
          process.env.JIRA_USERNAME,
          process.env.ATLASSIAN_EMAIL,
          process.env.ATLASSIAN_USERNAME
        ),
        password: getFirstValue(
          credentials.password,
          testCase.password,
          process.env.APP_LOGIN_PASSWORD,
          process.env.TEST_LOGIN_PASSWORD,
          process.env.SELENIUM_LOGIN_PASSWORD
        ),
        apiToken: getFirstValue(
          credentials.apiToken,
          credentials.token,
          credentials.basicAuthToken,
          credentials.basicAuthPassword,
          credentials.jiraApiToken,
          testCase.apiToken,
          testCase.token,
          testCase.basicAuthToken,
          testCase.basicAuthPassword,
          testCase.jiraApiToken,
          process.env.APP_API_TOKEN,
          process.env.HTTP_BASIC_AUTH_TOKEN,
          process.env.HTTP_BASIC_AUTH_PASSWORD,
          process.env.BASIC_AUTH_TOKEN,
          process.env.BASIC_AUTH_PASSWORD,
          process.env.JIRA_API_TOKEN,
          process.env.JIRA_TOKEN,
          process.env.ATLASSIAN_API_TOKEN,
          process.env.ATLASSIAN_TOKEN
        )
      },
      loginUrl: getFirstValue(testCase.loginUrl, testCase.authUrl, testCase.signInUrl),
      expectedUrlContains: getFirstValue(testCase.expectedUrlContains, testCase.dashboardUrlContains),
      selectors: testCase.selectors || testCase.loginSelectors || {}
    }

    addLog('INFO', `Target URL: ${ctx.baseUrl || 'missing'}`)

    executionModel = await resolveExecutionModel(
      {
        ...testCase,
        steps: rawSteps
      },
      ctx,
      addLog
    )
    const steps = Array.isArray(executionModel.steps) ? executionModel.steps : []
    const needsBrowser = steps.some((step) => !isApiStep(step))

    addLog('INFO', `Execution model version: ${executionModel.version}`)
    addLog('INFO', `Executable steps: ${steps.length}`)

    if (needsBrowser) {
      addLog('INFO', 'Validating target hostname before creating browser')
      try {
        const { hostname } = new URL(String(ctx.baseUrl || '').trim())
        const dns = require('dns').promises
        await dns.lookup(hostname)
        addLog('INFO', `DNS lookup OK: ${hostname}`)
      } catch (dnsErr) {
        addLog('ERROR', `DNS lookup failed for ${ctx.baseUrl}: ${dnsErr?.message || dnsErr}`)
        throw new Error(`Unresolvable hostname for target URL: ${ctx.baseUrl}`)
      }

      addLog('INFO', 'Initializing visible Chrome WebDriver session')
      driver = await createDriver(false)
    } else {
      addLog('INFO', 'No browser session required for API-only execution')
    }

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i]
      const stepName = describeExecutionStep(step)

      const index = i + 1

      addLog('INFO', `Step ${index} started: ${stepName}`)

      try {
        if (isApiStep(step)) {
          const response = await runApiStep(step, ctx)
          const message = response?.status
            ? `API response status ${response.status}`
            : response?.message
              ? response.message
            : 'API step completed'

          stepResults.push({
            index,
            id: step.id || `S${index}`,
            name: stepName,
            channel: step.channel || 'api',
            action: step.action || 'api',
            status: 'passed',
            message
          })
          addLog('PASS', `Step ${index} passed: ${stepName}`)
        } else {
          if (!driver) {
            addLog('INFO', 'Initializing visible Chrome WebDriver session')
            driver = await createDriver(false)
          }

          const result = await runHumanStep(driver, step, ctx, { stepTimeoutMs: 10000 })
          const action = result?.action || step.action || 'ui'
          const target = result?.target || step?.target?.name || 'element'
          const selector = result?.selector ? ` selector=${result.selector}` : ''
          let screenshotPath = null

          try {
            const shot = await captureStepScreenshot(driver, testCase, index)
            if (shot) {
              screenshotPath = shot.screenshot || shot
              const domPath = shot.dom || null
              if (screenshotPath) screenshots.push(screenshotPath)
              addLog('INFO', `Screenshot: ${screenshotPath} dom: ${domPath}`)
            }
          } catch (screenshotErr) {
            addLog('WARN', `Screenshot capture failed: ${screenshotErr?.message || String(screenshotErr)}`)
          }

          stepResults.push({
            index,
            id: step.id || `S${index}`,
            name: stepName,
            channel: step.channel || 'ui',
            action: step.action || action,
            status: 'passed',
            message: `${action} ${target}${selector}`,
            screenshotPath
          })
          addLog('PASS', `Step ${index} passed: ${stepName}`)
        }
      } catch (err) {
        const message = err?.message || String(err)
        let screenshotPath = null

        try {
          const shot = await captureStepScreenshot(driver, testCase, index)
          if (shot) {
            screenshotPath = shot.screenshot || shot
            const domPath = shot.dom || null
            if (screenshotPath) screenshots.push(screenshotPath)
            addLog('INFO', `Screenshot: ${screenshotPath} dom: ${domPath}`)
          }
        } catch (screenshotErr) {
          addLog('WARN', `Screenshot capture failed: ${screenshotErr?.message || String(screenshotErr)}`)
        }

        stepResults.push({
          index,
          id: step.id || `S${index}`,
          name: stepName,
          channel: step.channel || 'unknown',
          action: step.action || 'unknown',
          status: 'failed',
          message,
          screenshotPath
        })
        addLog('FAIL', `Step ${index} failed: ${stepName}`)
        addLog('ERROR', message)
        throw err
      }
    }

    addLog('SUCCESS', 'Test executed successfully')

    return {
      status: 'passed',
      message: 'Test executed successfully',
      logs,
      stepResults,
      screenshots,
      executionModel
    }
  } catch (err) {
    return {
      status: 'failed',
      message: err.message,
      errorMessage: err.message,
      logs,
      stepResults,
      screenshotPath: screenshots[screenshots.length - 1] || null,
      screenshots,
      executionModel
    }
  } finally {
    if (driver) {
      addLog('INFO', 'Closing Chrome WebDriver session')
      try {
        await driver.quit()
        addLog('INFO', 'Chrome WebDriver session closed')
      } catch (quitErr) {
        addLog('WARN', `Chrome WebDriver close failed: ${quitErr?.message || String(quitErr)}`)
      }
    }
  }
}

module.exports = { runTestCase }