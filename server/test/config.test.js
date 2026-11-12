// Production fails closed: a missing or weak secret stops the server at start,
// instead of it running with a default.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { TEST_ENV } from "./helpers.js";

const GOOD = {
  ...TEST_ENV,
  MONGODB_URI: "mongodb+srv://user:pass@cluster0.example.mongodb.net/?retryWrites=true",
  ECOSETU_JWT_SECRET: "a".repeat(40),
  ECOSETU_JWT_REFRESH_SECRET: "b".repeat(40),
  PHONE_HASH_SECRET: "c".repeat(40),
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test_token",
};

for (const [label, flags] of [
  ["NODE_ENV=production", { NODE_ENV: "production" }],
  ["any Vercel deployment (VERCEL=1)", { VERCEL: "1" }],
]) {
  describe(`fails closed in production: ${label}`, () => {
    const prod = { ...GOOD, ...flags };

    test("starts with every secret set and strong", () => {
      const config = loadConfig(prod);
      assert.equal(config.production, true);
      assert.deepEqual(config.warnings, []);
    });

    for (const name of ["PHONE_HASH_SECRET", "ECOSETU_JWT_SECRET", "ECOSETU_JWT_REFRESH_SECRET", "MONGODB_URI"]) {
      test(`refuses to start when ${name} is missing`, () => {
        assert.throws(() => loadConfig({ ...prod, [name]: "" }), new RegExp(name));
        const without = { ...prod };
        delete without[name];
        assert.throws(() => loadConfig(without), new RegExp(name));
      });
    }

    for (const name of ["PHONE_HASH_SECRET", "ECOSETU_JWT_SECRET", "ECOSETU_JWT_REFRESH_SECRET"]) {
      test(`refuses to start when ${name} is too short`, () => {
        assert.throws(() => loadConfig({ ...prod, [name]: "x".repeat(31) }), new RegExp(`${name}.*32`));
      });
    }

    test("refuses a MONGODB_URI that isn't a MongoDB connection string", () => {
      for (const uri of ["localhost", "http://cluster0.example.net", "mongodb://"]) {
        assert.throws(() => loadConfig({ ...prod, MONGODB_URI: uri }), /MONGODB_URI/);
      }
    });

    test("refuses to start without a photo store, and never uses the test folder store", () => {
      const noBlob = { ...prod };
      delete noBlob.BLOB_READ_WRITE_TOKEN;
      assert.throws(() => loadConfig(noBlob), /Blob/);
      assert.throws(() => loadConfig({ ...prod, ECOSETU_BLOB_FAKE_DIR: "/tmp/x" }), /tests only/);
    });

    test("refuses the same secret used twice", () => {
      assert.throws(() => loadConfig({ ...prod, ECOSETU_JWT_REFRESH_SECRET: prod.ECOSETU_JWT_SECRET }), /different/);
      assert.throws(() => loadConfig({ ...prod, PHONE_HASH_SECRET: prod.ECOSETU_JWT_SECRET }), /different/);
    });
  });
}

describe("secret names", () => {
  test("JWT_ACCESS_SECRET / JWT_REFRESH_SECRET are accepted as the names for the JWT secrets", () => {
    const env = { ...GOOD, NODE_ENV: "production", ECOSETU_JWT_SECRET: "", ECOSETU_JWT_REFRESH_SECRET: "", JWT_ACCESS_SECRET: "d".repeat(40), JWT_REFRESH_SECRET: "e".repeat(40) };
    const config = loadConfig(env);
    assert.equal(config.jwtSecret, "d".repeat(40));
    assert.equal(config.jwtRefreshSecret, "e".repeat(40));
    assert.throws(() => loadConfig({ ...env, JWT_ACCESS_SECRET: "short" }), /JWT_ACCESS_SECRET/);
  });
});

describe("development keeps working without secrets, loudly", () => {
  test("falls back and warns for every missing secret", () => {
    const config = loadConfig({ ...TEST_ENV, ECOSETU_JWT_SECRET: "", ECOSETU_JWT_REFRESH_SECRET: "", PHONE_HASH_SECRET: "" });
    assert.equal(config.production, false);
    for (const name of ["ECOSETU_JWT_SECRET", "ECOSETU_JWT_REFRESH_SECRET", "PHONE_HASH_SECRET", "Blob"]) {
      assert.ok(config.warnings.some((w) => w.includes(name)), name);
    }
    assert.equal(config.photoStorage.kind, "none");
  });
});

describe("demo login switch", () => {
  test("is off unless DEMO_LOGIN_ENABLED is exactly true", () => {
    assert.equal(loadConfig(GOOD).demoLoginEnabled, false);
    for (const v of ["1", "yes", "TRUE ", "false", ""]) assert.equal(loadConfig({ ...GOOD, DEMO_LOGIN_ENABLED: v }).demoLoginEnabled, false, v);
    assert.equal(loadConfig({ ...GOOD, DEMO_LOGIN_ENABLED: "true" }).demoLoginEnabled, true);
  });
});
