async function highlightElement(driver, element) {

  // ✅ scroll vers élément
  await driver.executeScript(`
    arguments[0].scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  `, element)

  await driver.sleep(300)

  // ✅ effet visuel pro
  await driver.executeScript(`

    const el = arguments[0];

    const rect = el.getBoundingClientRect();

    const circle = document.createElement('div');

    circle.style.position = 'fixed';
    circle.style.left = rect.left + 'px';
    circle.style.top = rect.top + 'px';

    circle.style.width = rect.width + 'px';
    circle.style.height = rect.height + 'px';

    circle.style.border = '4px solid red';
    circle.style.borderRadius = '12px';

    circle.style.boxShadow = '0 0 20px red';

    circle.style.zIndex = '999999';

    circle.style.pointerEvents = 'none';

    document.body.appendChild(circle);

    setTimeout(() => {
      circle.remove();
    }, 1200);

  `, element)

  await driver.sleep(700)
}

module.exports = {
  highlightElement
}