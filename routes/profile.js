var express = require('express');
var router = express.Router();
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var OAuth2Strategy = require('passport-oauth').OAuth2Strategy;
var IfmoSSOStrategy = require('passport-ifmosso').Strategy;
var config = require('nconf');
var db = require('../db');

function checkRole(req, res, next, role) {
    if (req.isAuthenticated()) {
        if (!role || req.user.role >= role) next();
        else res.status(403).end();
    }
    else {
        res.status(401).end();
    }
}

router.isAuth = function(req, res, next) {
    checkRole(req, res, next);
};
router.isStudent = function(req, res, next) {
    checkRole(req, res, next, 1);
};
router.isInspector = function(req, res, next) {
    checkRole(req, res, next, 2);
};
router.isAdministrator = function(req, res, next) {
    checkRole(req, res, next, 3);
};
router.isMyself = function(req, res, next) {
    if (req.params.userId === req.user._id) next();
    else res.status(403).end();
};
router.isInspectorOrMyself = function(req, res, next) {
    if (req.user.role > 1 || req.params.userId === req.user._id) next();
    else res.status(403).end();
};

OAuth2Strategy.prototype.userProfile = function(accessToken, done) {
    this._oauth2.get(config.get('auth:openedu:userProfile'), accessToken, function(err, body, res) {
        if (err) {
            var InternalOAuthError = require('passport-oauth').InternalOAuthError;
            return done(new InternalOAuthError('failed to fetch user profile', err));
        }
        try {
            done(null, JSON.parse(body));
        }
        catch (e) {
            done(e);
        }
    });
};

passport.use('local', new LocalStrategy(db.profile.auth.local));
passport.use('openedu', new OAuth2Strategy({
    authorizationURL: config.get('auth:openedu:authorizationURL'),
    tokenURL: config.get('auth:openedu:tokenURL'),
    clientID: config.get('auth:openedu:clientID'),
    clientSecret: config.get('auth:openedu:clientSecret'),
    callbackURL: config.get('auth:openedu:callbackURL')
}, db.profile.auth.openedu));
passport.use('ifmosso', new IfmoSSOStrategy({
    secretKey: config.get('auth:ifmosso:secretKey')
}, db.profile.auth.ifmosso));

passport.serializeUser(function(user, done) {
    done(null, user);
});
passport.deserializeUser(function(user, done) {
    done(null, user);
});

function logUserIP(req) {
    db.profile.log({
        userId: req.user._id,
        ip: req.ip
    });
}

router.get('/', function(req, res) {
    req.isAuthenticated() ? res.json(req.user) : res.status(401).end();
});
router.post('/login', function(req, res, next) {
    passport.authenticate('local', function(err, user, info) {
        if (err) return next(err);
        if (!user) return res.status(401).end();
        req.logIn(user, function(err) {
            if (err) return next(err);
            return res.json(user);
        });
    })(req, res, next);
    if (req.isAuthenticated()) logUserIP(req);
});
router.get('/openedu', passport.authenticate('openedu'));
router.get('/openedu/callback', function(req, res, next) {
    passport.authenticate('openedu', {
        successRedirect: '/',
        failureRedirect: '/#login'
    })(req, res, next);
    if (req.isAuthenticated()) logUserIP(req);
});
router.post('/ifmosso/callback', function(req, res, next) {
    passport.authenticate('ifmosso', {
        successRedirect: '/',
        failureRedirect: '/#login'
    })(req, res, next);
    if (req.isAuthenticated()) logUserIP(req);
});
router.get('/logout', function(req, res) {
    req.logout();
    res.end();
});

module.exports = router;