const { Builder } = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')

async function createDriver(headless = false) {
  const options = new chrome.Options()

  if (headless) options.addArguments('--headless=new')

  options.addArguments(
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--start-maximized',
    '--disable-extensions',
    '--disable-blink-features=AutomationControlled'
  )

  options.excludeSwitches('enable-logging')

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build()

  // 🔥 IMPORTANT: reduce blank page / rendering issues
  await driver.manage().setTimeouts({
    implicit: 5000,
    pageLoad: 30000,
    script: 30000
  })

  return driver
}

module.exports = { createDriver }