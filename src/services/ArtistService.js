import httpCommon from './http-common';

function create(vote) {
  return httpCommon.post('/artists', vote);
}

function get() {
  return httpCommon.get('/artists');
}

export default {
  create,
  get,
};