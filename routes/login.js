const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  passport.authenticate('login', async (err, admin, info) => {
    try {
      if (err || !admin) {
        const error = new Error('An error occured');

        return next(error);
      }

      req.login(admin, { session: false }, async (error) => {
        if (error) return next(error);

        const body = { id: admin.id, username: admin.username };
        const token = jwt.sign({ admin: body }, 'SECRET_TOKEN');

        return res.status(200).send({ token });
      });
    } catch (err) {
      return next(err);
    }
  })(req, res, next);
});

module.exports = router;
