const artist = require('../controllers/artist');

let router = require('express').Router();

router.post('/', artist.create);

module.exports = router;
