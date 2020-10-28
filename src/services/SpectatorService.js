import http from './http-common';

function create(vote) {
  return http.post('/spectators', vote);
}

function get() {
  return http.get('/spectators');
}

function destroy() {
  return http.delete('/spectators')
}

export default {
  create,
  get,
  destroy
};