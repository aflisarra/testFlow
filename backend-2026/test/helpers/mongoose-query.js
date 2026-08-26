function queryResult(value) {
  const promise = Promise.resolve(value)
  const query = {
    select() {
      return query
    },
    sort() {
      return query
    },
    lean() {
      return promise
    },
    then(resolve, reject) {
      return promise.then(resolve, reject)
    },
    catch(reject) {
      return promise.catch(reject)
    },
    finally(callback) {
      return promise.finally(callback)
    },
  }
  return query
}

module.exports = { queryResult }
