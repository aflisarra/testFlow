const { createDriver } = require('./driver.factory')
const { runHumanStep } = require('./ui.executor')
const { runApiStep, isApiStep, resetApiState } = require('./api.executor')

function getFirstValue(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (normalized) return normalized
  }
  return ''
}

async function runTestCase(testCase) {
  const driver = await createDriver(false)
  const logs = []
  const stepResults = []

  resetApiState()

  function addLog(level, message) {
    logs.push(`[${level}] ${message}`)
  }

  try {
    const steps = testCase.steps || []
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

    addLog('INFO', 'Initializing visible Chrome WebDriver session')
    addLog('INFO', `Target URL: ${ctx.baseUrl || 'missing'}`)

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i]

      if (typeof step === 'string') {
        const index = i + 1

        addLog('INFO', `Step ${index} started: ${step}`)

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
              name: step,
              status: 'passed',
              message
            })
            addLog('PASS', `Step ${index} passed: ${step}`)
          } else {
            const result = await runHumanStep(driver, step, ctx, { stepTimeoutMs: 10000 })
            const action = result?.action || 'ui'
            const target = result?.target || 'element'
            const selector = result?.selector ? ` selector=${result.selector}` : ''

            stepResults.push({
              index,
              name: step,
              status: 'passed',
              message: `${action} ${target}${selector}`
            })
            addLog('PASS', `Step ${index} passed: ${step}`)
          }
        } catch (err) {
          const message = err?.message || String(err)

          stepResults.push({
            index,
            name: step,
            status: 'failed',
            message
          })
          addLog('FAIL', `Step ${index} failed: ${step}`)
          addLog('ERROR', message)
          throw err
        }
      }
    }

    addLog('SUCCESS', 'Test executed successfully')

    return {
      status: 'passed',
      message: 'Test executed successfully',
      logs,
      stepResults
    }
  } catch (err) {
    return {
      status: 'failed',
      message: err.message,
      errorMessage: err.message,
      logs,
      stepResults
    }
  } finally {
    addLog('INFO', 'Closing Chrome WebDriver session')
    try {
      await driver.quit()
      addLog('INFO', 'Chrome WebDriver session closed')
    } catch (quitErr) {
      addLog('WARN', `Chrome WebDriver close failed: ${quitErr?.message || String(quitErr)}`)
    }
  }
}

module.exports = { runTestCase }
