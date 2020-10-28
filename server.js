const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = require('./public/App.js');
const path = require('path');
const passport = require('passport');

const server = express();

const corsOptions = {
  origin: ['http://localhost:3000', 'http://192.168.1.43:3000'],
};

server.use(cors(corsOptions));

server.use(bodyParser.json());

server.use(express.static(path.join(__dirname, 'public')));

require('./auth/auth');

const secureRoute = require('./routes/secureRoutes/secureRoutes');

server.use(
  '/api',
  passport.authenticate('jwt', { session: false }),
  secureRoute
);

const router = new express.Router();

router.use('/artists', require('./routes/artist'));
router.use('/spectators', require('./routes/spectator'));

server.use('/api', router);

server.get(
  '/admin',
  passport.authenticate('jwt', {
    session: false,
    successRedirect: '/admin',
    failureRedirect: 'login',
  })
);

server.get('*', function (req, res) {
  const { html } = app.render({ url: req.url });

  res.write(`
  <!DOCTYPE html>
  <title>TDN - Vote</title>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/bundle.css">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Rye">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Abhaya Libre">
  <body style="margin:0px">${html}</body>
  <script defer src="/bundle.js"></script>`);

  res.end();
});

const port = process.env.port || 3000;
server.listen(port, () => console.log(`Listening on port ${port}`));
