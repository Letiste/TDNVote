import http from './http-common';

function create(vote) {
  return http.post('/artists', vote);
}

function get() {
  return http.get('/artists');
}

export default {
  create,
  get,
};