
const { Builder } = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')

async function createDriver(headless = false) {
  console.log('[INFO] createDriver headless=', headless)
  const options = new chrome.Options()
  if (headless) options.addArguments('--headless=new')
  options.addArguments('--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=1920,1080', '--start-maximized', '--disable-extensions', '--disable-blink-features=AutomationControlled')
  options.excludeSwitches('enable-logging')

  try {
    const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build()
    await driver.manage().setTimeouts({ implicit: 5000, pageLoad: 30000, script: 30000 })
    console.log('[INFO] Chrome WebDriver created')
    return driver
  } catch (err) {
    console.error('[ERROR] createDriver failed:', err?.message || err)
    throw err
  }
}

module.exports = { createDriver }