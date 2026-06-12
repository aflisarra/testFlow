async function highlightElement(driver, element) {
    await element.click()
  await driver.executeScript(`
    arguments[0].style.border='4px solid red';
    arguments[0].style.boxShadow='0 0 15px red';
    arguments[0].style.backgroundColor='rgba(255,0,0,0.1)';
  `, element)

  await driver.sleep(400)
}

module.exports = { highlightElement }