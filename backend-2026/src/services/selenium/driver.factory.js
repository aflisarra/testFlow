const { Builder } = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')
const fs = require('fs')
const os = require('os')
const path = require('path')

function tryRegisterChromeDriver() {
  try {
    // Optional dependency: if chromedriver is installed locally, load it.
    // selenium-webdriver can also fall back to Selenium Manager when available,
    // so missing chromedriver should not crash the backend at startup.
    require('chromedriver')
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error
  }
}

async function createDriver({ profileKey = '' } = {}) {
  tryRegisterChromeDriver()

  const options = new chrome.Options()

  options.addArguments(
    '--start-maximized',
    '--disable-infobars',
    '--disable-notifications',
    '--disable-dev-shm-usage',
    '--no-sandbox'
  )

  // Keep navigation from blocking the whole execution when the target page
  // is slow to finish rendering. We still verify the DOM manually after load.
  options.setPageLoadStrategy('eager')

  // Keep authentication cookies between dependent test executions. Each
  // suite gets its own profile so one suite cannot reuse another suite's login.
  const safeProfileKey = String(profileKey || 'default')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120)
  const profileRoot = process.env.SELENIUM_PROFILE_DIR || path.join(os.tmpdir(), 'pfe-selenium-profiles')
  const profilePath = path.join(profileRoot, safeProfileKey)
  fs.mkdirSync(profilePath, { recursive: true })
  options.addArguments(`--user-data-dir=${profilePath}`)
  console.log(`[SELENIUM] Chrome profile: ${profilePath}`)

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build()

  await driver.manage().setTimeouts({
    implicit: 10000,
    pageLoad: 120000,
    script: 60000
  })

  return driver
}

module.exports = { createDriver }
