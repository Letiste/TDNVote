const post = require('../controllers/artist');

let router = require('express').Router();

router.post('/', post.create);

router.get('/', post.findAll);

module.exports = router