const { exportWordService } = require('../services/export-word/exportWord.service')

exports.exportWord = async (req, res) => exportWordService(req, res)
