const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = require('../public/App.js');
const path = require('path');
const passport = require('passport');
const session = require('express-session');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');

const server = express();

server.use(cookieParser('SECRET_TOKEN'));

server.use(session({ secret: 'keyboard cat' }));

server.use(flash());

const corsOptions = {
  origin: ['http://localhost:3000', 'http://192.168.1.43:3000'],
};

server.use(cors(corsOptions));

server.use(bodyParser.json());

server.use(express.static(path.join(__dirname, '../public')));

require('./auth/auth');

const router = new express.Router();

router.use('/artists', require('./routes/artist'));
router.use('/spectators', require('./routes/spectator'));
router.use('/login', require('./routes/login'));

server.use('/api', router);

const secureRoute = require('./routes/secureRoutes/secureRoutes');

server.use(
  '/api/admin',
  passport.authenticate('jwt', { session: false }),
  secureRoute
);

server.get(
  '/admin',
  passport.authenticate('jwt', {
    session: false,
    failureRedirect: '/login',
    failureFlash: "Vous n'êtes pas connecté",
  }),

  (req, res, next) => {
    return next();
  }
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
