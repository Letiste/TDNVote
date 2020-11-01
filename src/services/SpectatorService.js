import httpCommon from './http-common';

function create(vote) {
  return httpCommon.post('/spectators', vote);
}

function get() {
  return httpCommon.get(`/admin/spectators`);
}

function destroy() {
  return httpCommon.delete(`/admin/spectators`);
}

export default {
  create,
  get,
  destroy,
};
