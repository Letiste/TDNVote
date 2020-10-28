const db = require('../models/index');
const Artist = db.Artist;

// Create and save a new Artist
exports.create = async (req, res) => {
  try {
    const artist = {
      ticketNumber: req.body.ticketNumber,
      vote: req.body.vote,
    };

    await Artist.create(artist);

    res.status(201).send({ message: 'Artist was successfully created' });
  } catch (err) {
    res.status(500).send({ message: err.errors });
  }
};

// Retrieve all Artists
exports.findAll = async (req, res) => {
  try {
    const artists = await Artist.findAll({attributes: ["ticketNumber", "vote"]});

    res.status(200).send(artists);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};
