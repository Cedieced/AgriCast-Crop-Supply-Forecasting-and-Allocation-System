import test from "node:test";
import assert from "node:assert/strict";
import { getWebOrigins, validateEnvironment } from "../src/config.js";

const productionEnvironment = {
  NODE_ENV: "production",
  JWT_SECRET: "a-production-only-secret-that-is-long-enough",
  MYSQL_HOST: "mysql.example.com",
  MYSQL_PORT: "3306",
  MYSQL_DATABASE: "crop_supply_prod",
  MYSQL_USER: "cropapp",
  MYSQL_PASSWORD: "a-managed-database-password",
  WEB_ORIGIN: "https://agricast.example.gov.ph",
  DB_AUTO_MIGRATE: "false",
};

function withEnvironment(overrides, callback) {
  const original = new Map(
    Object.keys({ ...productionEnvironment, ...overrides }).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, productionEnvironment, overrides);
  try {
    callback();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("production configuration accepts an HTTPS web origin and remote MySQL", () => {
  withEnvironment({}, () => {
    assert.doesNotThrow(validateEnvironment);
    assert.deepEqual(getWebOrigins(), ["https://agricast.example.gov.ph"]);
  });
});

test("production configuration rejects insecure origins and automatic schema changes", () => {
  withEnvironment({ WEB_ORIGIN: "http://agricast.example.gov.ph" }, () => {
    assert.throws(validateEnvironment, /non-HTTPS/);
  });
  withEnvironment({ DB_AUTO_MIGRATE: "true" }, () => {
    assert.throws(validateEnvironment, /DB_AUTO_MIGRATE must be false/);
  });
});

test("production configuration requires explicit database credentials and a strong JWT secret", () => {
  withEnvironment({ MYSQL_PASSWORD: "", JWT_SECRET: "too-short" }, () => {
    assert.throws(validateEnvironment, /MYSQL_PASSWORD must be set/);
    assert.throws(validateEnvironment, /JWT_SECRET must be at least 32 characters/);
  });
});

test("production configuration rejects local database hosts and example secrets", () => {
  withEnvironment({ MYSQL_HOST: "localhost" }, () => {
    assert.throws(validateEnvironment, /managed remote database/);
  });
  withEnvironment({ JWT_SECRET: "replace-this-with-a-random-secret-of-at-least-32-characters" }, () => {
    assert.throws(validateEnvironment, /placeholder value/);
  });
});
