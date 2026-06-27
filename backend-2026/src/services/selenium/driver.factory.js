const { Builder } = require('selenium-webdriver')
require('chromedriver')

const chrome = require('selenium-webdriver/chrome')

async function createDriver() {

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
