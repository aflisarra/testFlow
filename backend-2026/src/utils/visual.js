async function highlightElement(driver, element) {

  await driver.executeScript(`
    arguments[0].scrollIntoView({
      behavior: 'instant',
      block: 'center'
    });
  `, element)

  await driver.sleep(200)

  await driver.executeScript(`
    const el = arguments[0];
    const rect = el.getBoundingClientRect();

    const overlay = document.createElement('div');

    overlay.style.position = 'fixed';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    overlay.style.border = '4px solid red';
    overlay.style.background = 'rgba(255,0,0,0.15)';
    overlay.style.zIndex = '9999999';

    document.body.appendChild(overlay);

    window.__highlight = overlay;
  `, element)
}

module.exports = {
  highlightElement  // ✅ IMPORTANT
}