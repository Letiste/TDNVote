const spectator = require('../controllers/spectator');

let router = require('express').Router();

router.post('/', spectator.create);

router.get('/', spectator.findAll);

router.delete('/', spectator.delete)

module.exports = router;
