import httpCommon from './http-common';

function create(vote) {
  return httpCommon.post('/artists', vote);
}

function get() {
  return httpCommon.get(`/artists`);
}

function destroy() {
  return httpCommon.delete(`/artists`);
}

export default {
  create,
  get,
  destroy,
};
