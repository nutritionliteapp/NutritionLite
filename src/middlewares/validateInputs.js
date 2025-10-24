module.exports = (req, res, next) => {
    const sanitize = (value) => {
      if (typeof value === "string") {
        return value.replace(/['";]/g, "").trim();
      }
      return value;
    };
  
    for (let key in req.body) req.body[key] = sanitize(req.body[key]);
    for (let key in req.query) req.query[key] = sanitize(req.query[key]);
    for (let key in req.params) req.params[key] = sanitize(req.params[key]);
  
    next();
  };
  