const { Builder } = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')

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

async function createDriver() {
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
