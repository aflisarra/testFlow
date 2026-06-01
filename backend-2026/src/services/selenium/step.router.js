/*function isApiStep(step) {
  if (step && typeof step === 'object') {
    const channel = String(step.channel || '').toLowerCase()
    const action = String(step.action || '').toLowerCase()
    return (
      channel === 'api' ||
      (channel === 'assertion' && action === 'assert_status') ||
      ['set_auth', 'http_request', 'assert_status'].includes(action)
    )
  }

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

module.exports = { isApiStep }*/
