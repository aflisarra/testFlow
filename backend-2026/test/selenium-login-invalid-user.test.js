const test = require('node:test')
const assert = require('node:assert/strict')
const seleniumService = require('../src/services/selenium/selenium.service')

test('invalid username keeps user on login page and counts as a valid failed login attempt', () => {
  const actual = {
    url: 'http://localhost:4200/login',
    title: 'Login',
    errorMessage: 'Invalid credentials',
    text: 'Invalid credentials'
  }

  const result = seleniumService.compareStepExpectedResult(
    actual,
    'Login request is not submitted',
    'Click Login button'
  )

  assert.equal(result.status, 'passed')
  assert.equal(result.matched, true)
})
