const { Builder } = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')

async function createDriver() {
  const options = new chrome.Options()
  options.addArguments('--start-maximized')

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build()

  return driver
}

module.exports = { createDriver }