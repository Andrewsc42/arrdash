// Middleware to protect all routes behind authentication

function requireAuth(req, res, next) {
  // Allow the login page and auth endpoints through
  const openPaths = ['/login', '/api/auth/login', '/api/auth/status'];
  if (openPaths.includes(req.path)) return next();

  // Allow static assets on the login page (css loaded from login.html)
  if (req.path.startsWith('/assets')) return next();

  if (req.session && req.session.authenticated) {
    return next();
  }

  // API requests get a 401 rather than a redirect
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Everyone else gets redirected to login
  return res.redirect('/login');
}

module.exports = requireAuth;
