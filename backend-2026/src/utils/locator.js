const { By } = require('selenium-webdriver')

function getLocator(target = {}) {

  const by = String(target.by || 'css')
    .toLowerCase()

  const selector = target.selector

  if (!selector) {
    throw new Error('Missing selector')
  }

  switch (by) {

    case 'id':
      return By.id(selector)

    case 'name':
      return By.name(selector)

    case 'xpath':
      return By.xpath(selector)

    default:
      return By.css(selector)
  }
}

module.exports = {
  getLocator
}