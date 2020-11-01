import httpCommon from './http-common';

function create(vote) {
  return httpCommon.post('/artists', vote);
}

function get() {
  return httpCommon.get(`/admin/artists`);
}

function destroy() {
  return httpCommon.delete(`/admin/artists`);
}

export default {
  create,
  get,
  destroy,
};
