const localOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function getWebOrigins() {
  const configured = process.env.WEB_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean);
  return configured?.length ? configured : isProduction() ? [] : localOrigins;
}

export function validateEnvironment() {
  const production = isProduction();
  const errors = [];
  const required = ["MYSQL_HOST", "MYSQL_PORT", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"];
  if (production) {
    required.push("WEB_ORIGIN");
  }
  for (const name of required) {
    if (!process.env[name]?.trim()) errors.push(`${name} must be set`);
  }

  const port = Number(process.env.MYSQL_PORT || (production ? NaN : 3306));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("MYSQL_PORT must be a valid TCP port");
  }
  if (process.env.PORT && (!Number.isInteger(Number(process.env.PORT)) ||
      Number(process.env.PORT) < 1 || Number(process.env.PORT) > 65535)) {
    errors.push("PORT must be a valid TCP port");
  }
  const minimumSecretLength = production ? 32 : 24;
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < minimumSecretLength) {
    errors.push(`JWT_SECRET must be at least ${minimumSecretLength} characters`);
  } else if (production && /replace|change.?me|example|your.?secret|password|default/i.test(process.env.JWT_SECRET)) {
    errors.push("JWT_SECRET must not be a placeholder value");
  }

  if (production) {
    if (["localhost", "127.0.0.1", "::1"].includes(process.env.MYSQL_HOST?.toLowerCase())) {
      errors.push("MYSQL_HOST must point to the managed remote database, not localhost");
    }
    const origins = getWebOrigins();
    if (!origins.length) errors.push("WEB_ORIGIN must contain at least one approved HTTPS origin");
    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (parsed.protocol !== "https:" || parsed.origin !== origin) {
          errors.push(`WEB_ORIGIN contains a non-HTTPS or non-origin URL: ${origin}`);
        }
      } catch {
        errors.push(`WEB_ORIGIN contains an invalid URL: ${origin}`);
      }
    }
    if (process.env.DB_AUTO_MIGRATE &&
        !["false", "0"].includes(process.env.DB_AUTO_MIGRATE.toLowerCase())) {
      errors.push("DB_AUTO_MIGRATE must be false in production; run npm run db:migrate as a release step");
    }
    const hasBootstrapEmail = Boolean(process.env.INITIAL_ADMIN_EMAIL);
    const hasBootstrapPassword = Boolean(process.env.INITIAL_ADMIN_PASSWORD);
    if (hasBootstrapEmail !== hasBootstrapPassword) {
      errors.push("INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be set or omitted together");
    }
    if (hasBootstrapPassword && process.env.INITIAL_ADMIN_PASSWORD.length < 16) {
      errors.push("INITIAL_ADMIN_PASSWORD must be at least 16 characters");
    }
    if (hasBootstrapEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.INITIAL_ADMIN_EMAIL)) {
      errors.push("INITIAL_ADMIN_EMAIL must be a valid email address");
    }
  }

  if (errors.length) {
    throw new Error(`Invalid deployment configuration:\n- ${errors.join("\n- ")}`);
  }
}
