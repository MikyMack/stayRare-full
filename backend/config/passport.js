const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
require('dotenv').config();

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_SECRET,
  callbackURL: "https://hofmaan.com/auth/google/callback",
  passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
  try {
    // Try to find user by googleId
    let user = await User.findOne({ googleId: profile.id });
    if (user) {
      return done(null, user);
    }

    // If not found by googleId, try to find by email
    const email = profile.emails && profile.emails[0] && profile.emails[0].value;
    if (email) {
      user = await User.findOne({ email: email });
      if (user) {
        // Link Google account to existing user
        user.googleId = profile.id;
        await user.save();
        return done(null, user);
      }
    }

    // If no user found, create new user
    const newUser = await User.create({
      googleId: profile.id,
      name: profile.displayName,
      email: email
    });
    done(null, newUser);
  } catch (err) {
    done(err, null);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) =>
  User.findById(id).then(user => done(null, user)).catch(err => done(err))
);
