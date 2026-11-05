import jwt from "jsonwebtoken";

const roles = new Set(["admin", "municipal_officer", "provincial_officer", "field_officer"]);

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function allowRoles(...allowed) {
  return (req, res, next) => {
    if (!roles.has(req.user?.role) || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action" });
    }
    next();
  };
}
