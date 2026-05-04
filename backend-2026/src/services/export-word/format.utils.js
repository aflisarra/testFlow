function formatDateDDMMYYYY(date) {
  const d = date instanceof Date ? date : new Date(date)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  return `${dd}/${mm}/${yyyy}`
}

function formatDateForFilename(date) {
  const d = date instanceof Date ? date : new Date(date)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  return `${yyyy}-${mm}-${dd}`
}

function sanitizeFilename(value) {
  return String(value || 'TestSuite')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80)
}

module.exports = { formatDateDDMMYYYY, formatDateForFilename, sanitizeFilename }

