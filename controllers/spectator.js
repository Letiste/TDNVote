const db = require('../models/index');
const Spectator = db.Spectator;

// Create and save a new Spectator
exports.create = async (req, res) => {
  try {
    const spectator = {
      ticketNumber: req.body.ticketNumber,
      vote: req.body.vote,
    };

    await Spectator.create(spectator);

    res.status(201).send({ message: 'Spectator was successfully created' });
  } catch (err) {
    res.status(500).send({ message: err.errors });
  }
};

// Retrieve all Spectators
exports.findAll = async (req, res) => {
  try {
    const spectators = await Spectator.findAll({attributes: ["ticketNumber", "vote"]});

    res.status(200).send(spectators);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};
