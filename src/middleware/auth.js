export function requireAuth(req, res, next) {
  if (req.session && req.session.adminUser) {
    res.locals.currentUser = req.session.adminUser;
    return next();
  }

  if (req.xhr || req.headers.accept?.includes('json')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  return res.redirect('/admin/login');
}
