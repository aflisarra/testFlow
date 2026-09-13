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
  const remoteUrl = (process.env.SELENIUM_REMOTE_URL || '').trim().replace(/\/+$/, '')
  const isRemote = Boolean(remoteUrl)

  const options = new chrome.Options()

  if (!isRemote) {
    tryRegisterChromeDriver()

    if (fs.existsSync('/usr/bin/chromium-browser')) {
      options.setChromeBinaryPath('/usr/bin/chromium-browser')
    } else if (fs.existsSync('/usr/bin/chromium')) {
      options.setChromeBinaryPath('/usr/bin/chromium')
    }

    if (process.env.SELENIUM_HEADLESS !== 'false') {
      options.addArguments('--headless')
    }

    const safeProfileKey = String(profileKey || 'default')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 120)
    const profileRoot = process.env.SELENIUM_PROFILE_DIR || path.join(os.tmpdir(), 'pfe-selenium-profiles')
    const profilePath = path.join(profileRoot, safeProfileKey)
    fs.mkdirSync(profilePath, { recursive: true })
    options.addArguments(`--user-data-dir=${profilePath}`)
    console.log(`[SELENIUM] Chrome profile: ${profilePath}`)
  }

  options.addArguments(
    '--disable-gpu',
    '--start-maximized',
    '--disable-infobars',
    '--disable-notifications',
    '--disable-dev-shm-usage',
    '--no-sandbox'
  )

  options.setPageLoadStrategy('eager')

  let builder = new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)

  if (isRemote) {
    const normalizedRemoteUrl = remoteUrl.endsWith('/wd/hub') ? remoteUrl.replace(/\/wd\/hub$/, '') : remoteUrl
    console.log(`[SELENIUM] Connecting to standalone Chrome at: ${normalizedRemoteUrl}`)
    builder = builder.usingServer(normalizedRemoteUrl)
  }

  const driver = await builder.build()

  await driver.manage().setTimeouts({
    implicit: 10000,
    pageLoad: 120000,
    script: 60000
  })

  return driver
}

module.exports = { createDriver }
