const passport = require('passport');
const localStrategy = require('passport-local').Strategy;
const JWTStrategy = require('passport-jwt').Strategy;
const ExtractJWT = require('passport-jwt').ExtractJwt;
const db = require('../models/index');
const Admin = db.Admin;

passport.use(
  'login',
  new localStrategy(
    { usernameField: 'username', passwordField: 'password' },
    async (username, password, done) => {
      try {
        const admin = await Admin.findOne({ username });

        if (!user)
          return done(null, false, { message: "L'utilisateur n'existe pas" });

        const validate = await admin.isValidPassword(password);

        if (!validate)
          return done(null, false, { message: 'Mauvais mot de passe' });

        return done(null, admin, { message: 'Connexion réussie' });
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.use(
  new JWTStrategy(
    {
      secretOrKey: 'SECRET_TOKEN',
      jwtFromRequest: ExtractJWT.fromUrlQueryParameter('secret_token'),
    },
    async (token, done) => {
      try {
        return done(null, token.admin);
      } catch (err) {
        done(err);
      }
    }
  )
);
