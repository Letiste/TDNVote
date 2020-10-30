const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');

const router = express.Router();

router.post('/', async (req, res, next) => {
  passport.authenticate(
    'login',
    { session: false },
    async (err, user, info) => {
      try {
        if (err) throw new Error(err.message);

        if (!user) throw new Error(info.message);

        req.login(user, { session: false }, async (error) => {
          if (error) throw new Error(error.message);

          const token = jwt.sign({ user: user.id }, 'SECRET_TOKEN');
          console.log(token);
          res.cookie('jwt', token, { sameSite: true });
        });
        return res.status(200).send({ message: 'You are connected' });
      } catch (err) {
        return res.status(500).send({ message: err.message });
      }
    }
  )(req, res, next);
});

module.exports = router;
