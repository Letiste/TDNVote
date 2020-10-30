const passport = require('passport');
const localStrategy = require('passport-local').Strategy;
const JWTStrategy = require('passport-jwt').Strategy;
const JwtCookieComboStrategy = require('passport-jwt-cookiecombo');
const jwt = require('jsonwebtoken');
const db = require('../models/index');
const Admin = db.Admin;

passport.use(
  'login',
  new localStrategy(
    { usernameField: 'username', passwordField: 'password' },
    async (username, password, done) => {
      try {
        const admin = await Admin.findOne({ where: { username } });

        if (!admin)
          return done(null, false, { message: "L'utilisateur n'existe pas" });

        const validate = await admin.isValidPassword(password);

        if (!validate) {
          return done(null, false, { message: 'Mauvais mot de passe' });
        }
        return done(null, admin, { message: 'Connexion réussie' });
      } catch (err) {
        return done(err);
      }
    }
  )
);

// passport.use(
//   new JwtCookieComboStrategy(
//     {
//       secretOrPublicKey: 'SECRET_TOKEN',
//       passReqToCallback: false,
//     },
//     (payload, done) => {
//       console.log('PAYLOAD', payload);
//       return done(null, payload.user, {});
//     }
//   )
// );

// const cookieExtractor = async function (req) {
//   let token = null;

//   if (req && req.cookies) {
//     token = req.cookies['jwt'];
//     console.log('TOKEN', token);
//     const user = jwt.verify(token, 'SECRET_TOKEN');
//     console.log('USER', user);

//     return user;
//   }
// };

passport.use(
  new JWTStrategy(
    {
      secretOrKey: 'SECRET_TOKEN',
      jwtFromRequest: (req) => req.cookies.jwt,
    },
    async (user, done) => {
      try {
        return done(null, user);
      } catch (err) {
        done(err);
      }
    }
  )
);
