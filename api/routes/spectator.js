const spectator = require('../controllers/spectator');

let router = require('express').Router();

router.post('/', spectator.create);

module.exports = router;
