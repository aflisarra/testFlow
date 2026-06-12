function addLog(logs, stepIndex, level, message, data = {}) {
  logs.push({
    time: new Date().toISOString(),
    stepIndex,
    level,
    message,
    data
  })
}

module.exports = { addLog }