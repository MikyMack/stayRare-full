module.exports = (req, res, next) => {
    if (req.session.user) {
      next();
    } else {
      if (req.xhr || req.headers.accept.includes('application/json')) {
        return res.status(401).json({ error: 'Unauthorized: Please log in first' });
      } else {
        return res.redirect('/auth/login');
      }
    }
  };
   