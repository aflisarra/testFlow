function responseSpy() {
  const response = {
    statusCode: 200,
    body: undefined,
    ended: false,
    downloaded: null,
    status(code) {
      response.statusCode = code
      return response
    },
    json(body) {
      response.body = body
      return response
    },
    end() {
      response.ended = true
      return response
    },
    download(absolutePath, fileName) {
      response.downloaded = { absolutePath, fileName }
      return response
    },
  }
  return response
}

module.exports = { responseSpy }
