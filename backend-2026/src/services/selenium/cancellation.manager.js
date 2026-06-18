const activeExecutions = new Map()

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
  const item = activeExecutions.get(executionId)

  if (!item) {
    return false
  }

  item.cancelled = true
  item.controller.abort()

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
}

module.exports = {
  createExecutionController,
  cancelExecution,
  isExecutionCancelled,
  getExecutionSignal,
  cleanupExecution
}