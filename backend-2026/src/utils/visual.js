async function highlightElement(driver, element, durationMs = 1500) {
  await driver.executeScript((el, ms) => {
    if (!el) return

    const existing = document.querySelector('[data-ai-highlight="true"]')
    if (existing) {
      try {
        existing.remove()
      } catch (_) {}
    }

    const rect = el.getBoundingClientRect()
    const overlay = document.createElement('div')
    overlay.setAttribute('data-ai-highlight', 'true')
    overlay.style.position = 'fixed'
    overlay.style.left = `${rect.left}px`
    overlay.style.top = `${rect.top}px`
    overlay.style.width = `${Math.max(rect.width, 2)}px`
    overlay.style.height = `${Math.max(rect.height, 2)}px`
    overlay.style.border = '4px solid #ff0000'
    overlay.style.borderRadius = '10px'
    overlay.style.boxShadow = '0 0 0 6px rgba(255, 0, 0, 0.28), 0 0 22px rgba(255, 0, 0, 0.45)'
    overlay.style.background = 'rgba(255, 0, 0, 0.03)'
    overlay.style.pointerEvents = 'none'
    overlay.style.boxSizing = 'border-box'
    overlay.style.zIndex = '2147483647'
    overlay.style.animation = 'aiPulse 700ms ease-in-out infinite alternate'

    if (!document.getElementById('ai-highlight-style')) {
      const style = document.createElement('style')
      style.id = 'ai-highlight-style'
      style.textContent = `
        @keyframes aiPulse {
          from { transform: scale(1); opacity: 0.85; }
          to { transform: scale(1.01); opacity: 1; }
        }
      `
      document.head.appendChild(style)
    }

    document.body.appendChild(overlay)

    window.setTimeout(() => {
      try {
        overlay.remove()
      } catch (_) {}
    }, Number(ms) || 1500)
  }, element, durationMs)
}

module.exports = { highlightElement }
