import httpCommon from './http-common';

function create(user) {
  return httpCommon.post('/login', user);
}

export default {
  create,
};
