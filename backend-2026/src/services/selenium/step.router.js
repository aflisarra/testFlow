function isApiStep(step) {
  const t = String(step || '').toLowerCase()

  return (
    t.includes('post request') ||
    t.includes('get request') ||
    t.includes('put request') ||
    t.includes('delete request') ||
    t.includes('status code') ||
    t.includes('endpoint') ||
    t.includes('authorization header') ||
    t.includes('basic auth') ||
    t.includes('auth credential') ||
    t.includes('http authorization')
  )
}

module.exports = { isApiStep }
