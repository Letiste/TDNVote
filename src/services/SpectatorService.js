import httpCommon from './http-common';

function create(vote) {
  return httpCommon.post('/spectators', vote);
}

function get() {
  return httpCommon.get(`/spectators`);
}

function destroy() {
  return httpCommon.delete(`/spectators`);
}

export default {
  create,
  get,
  destroy,
};
