function auth(req, res, next) {
  next();
}

function optionalAuth(req, res, next) {
  next();
}

function adminAuth(req, res, next) {
  next();
}

module.exports = {
  auth,
  optionalAuth,
  adminAuth,
};
