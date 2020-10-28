import httpCommon from './http-common';

function create(vote) {
  return httpCommon.post('/spectators', vote);
}

function get() {
  return httpCommon.get('/spectators');
}

function destroy() {
  return http.delete('/spectators')
}

export default {
  create,
  get,
  destroy
};