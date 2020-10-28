const artist = require('../controllers/artist');

let router = require('express').Router();

router.post('/', artist.create);

router.get('/', artist.findAll);

router.delete('/', artist.delete)

module.exports = router