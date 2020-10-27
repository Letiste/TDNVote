module.exports = (app) => {
  const post = require('../controllers/spectator');

  let router = require('express').Router();

  router.post('/', post.create);

  router.get('/', post.findAll);

  app.use('/api/spectators', router);
};