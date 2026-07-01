const activeExecutions = new Map()
const abortCallbacks = new Map()
const activeDrivers = new Map()

function registerDriver(executionId, driver) {
  activeDrivers.set(executionId, driver)
}

function registerAbortCallback(executionId, callback) {
  abortCallbacks.set(executionId, callback)
}

function createExecutionController(executionId) {
  const controller = new AbortController()
  activeExecutions.set(executionId, {
    controller,
    cancelled: false,
    createdAt: Date.now()
  })
  return controller
}

function cancelExecution(executionId) {
  console.log('🔍 cancelExecution called for:', executionId)
  console.log('🔍 activeExecutions keys:', Array.from(activeExecutions.keys()))
  console.log('🔍 activeDrivers keys:', Array.from(activeDrivers.keys()))

  const item = activeExecutions.get(executionId)
  console.log('🔍 item found:', Boolean(item))


  if (!item) return false

  item.cancelled = true
  item.controller.abort()

  const driver = activeDrivers.get(executionId)
  if (driver) {
    driver.quit().catch(() => {})
    activeDrivers.delete(executionId)
  }

  const cb = abortCallbacks.get(executionId)
  if (cb) {
    cb()
    abortCallbacks.delete(executionId)
  }

  return true
}

function isExecutionCancelled(executionId) {
  const item = activeExecutions.get(executionId)
  return Boolean(item?.cancelled || item?.controller?.signal?.aborted)
}

function getExecutionSignal(executionId) {
  return activeExecutions.get(executionId)?.controller?.signal
}

function cleanupExecution(executionId) {
  activeExecutions.delete(executionId)
  abortCallbacks.delete(executionId)
  activeDrivers.delete(executionId)
}

module.exports = {
  createExecutionController,
  cancelExecution,
  isExecutionCancelled,
  getExecutionSignal,
  cleanupExecution,
  registerAbortCallback,
  registerDriver,
}