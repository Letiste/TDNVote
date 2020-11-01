const artist = require('../../controllers/artist');
const spectator = require('../../controllers/spectator');

let router = require('express').Router();

router.get('/spectators', spectator.findAll);

router.delete('/spectators', spectator.delete);

router.get('/artists', artist.findAll);

router.delete('/artists', artist.delete);

module.exports = router;
