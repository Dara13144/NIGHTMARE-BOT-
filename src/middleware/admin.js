export function requireRole(allowedRoles = ['admin', 'superadmin']) {
  return (req, res, next) => {
    const user = req.session?.adminUser;

    if (!user) {
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return res.redirect('/admin/login');
    }

    if (!allowedRoles.includes(user.role)) {
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(403).json({ error: 'Insufficient permissions for this action' });
      }
      return res.status(403).send('Forbidden: Insufficient privileges');
    }

    return next();
  };
}
