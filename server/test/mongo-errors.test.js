// Admin-script error lines: the server's code, codeName and the failing
// command, never the URI, username or password.
import { test } from "node:test";
import assert from "node:assert/strict";
import { connectDatabase, describeMongoError, redactUri } from "../src/db.js";

const USER = "ecosetuAdmin";
const PASS = "S3cr%40t-pass"; // percent-encoded "S3cr@t-pass"
const URI = `mongodb+srv://${USER}:${PASS}@cluster0.abcde.mongodb.net/?retryWrites=true`;

const serverError = (code, codeName, errmsg) => Object.assign(new Error(errmsg), { name: "MongoServerError", code, codeName, errmsg });

const assertNoSecrets = (line) => {
  for (const secret of [URI, USER, PASS, "S3cr@t-pass"]) assert.ok(!line.includes(secret), `leaked "${secret}" in: ${line}`);
};

test("Atlas permission error: code 8000 (AtlasError), the command and the reason", () => {
  const err = serverError(8000, "AtlasError", "user is not allowed to do action [collMod] on [ecosetu.locations]");
  const line = describeMongoError(err, { uri: URI, failedCommand: { name: "collMod", code: 8000 } });
  assert.equal(line, "MongoServerError, code 8000 (AtlasError), command: collMod — user is not allowed to do action [collMod] on [ecosetu.locations]");
});

test("Unauthorized (13): the echoed command document is cut off", () => {
  const err = serverError(13, "Unauthorized", 'not authorized on ecosetu to execute command { collMod: "users", lsid: { id: UUID("x") }, $clusterTime: { signature: { hash: BinData(0, "AAAA") } } }');
  const line = describeMongoError(err, { uri: URI, failedCommand: { name: "collMod", code: 13 } });
  assert.equal(line, "MongoServerError, code 13 (Unauthorized), command: collMod — not authorized on ecosetu to execute command");
});

test("AuthenticationFailed (18) is blamed on the handshake, without the username", () => {
  const err = serverError(18, "AuthenticationFailed", `bad auth : authentication failed for user ${USER}`);
  const line = describeMongoError(err, { uri: URI });
  assert.match(line, /^MongoServerError, code 18 \(AuthenticationFailed\), command: authenticate \(connection handshake\) — bad auth/);
  assertNoSecrets(line);
});

test("a command that failed earlier with another code isn't blamed", () => {
  const err = serverError(121, "DocumentValidationFailure", "Document failed validation");
  const line = describeMongoError(err, { uri: URI, failedCommand: { name: "create", code: 48 } });
  assert.equal(line, "MongoServerError, code 121 (DocumentValidationFailure) — Document failed validation");
});

test("a wrapped server error (cause / reason) still gives its code", () => {
  const inner = serverError(8000, "AtlasError", "bad auth : Authentication failed.");
  const outer = Object.assign(new Error("Server selection timed out"), { name: "MongoServerSelectionError", reason: { cause: inner } });
  assert.match(describeMongoError(outer, { uri: URI }), /^MongoServerSelectionError, code 8000 \(AtlasError\)/);
});

test("the URI, username and password are removed wherever they appear", () => {
  const text = `failed for ${URI} as ${USER} with ${PASS} / S3cr@t-pass, also mongodb://other:pw@host:27017/x`;
  const out = redactUri(text, URI);
  assertNoSecrets(out);
  assert.ok(!out.includes("other:pw"));
  const err = Object.assign(new Error(text), { name: "MongoParseError" });
  assertNoSecrets(describeMongoError(err, { uri: URI }));
});

test("a failed connect carries details without the URI or credentials", async () => {
  const bad = `notmongo://${USER}:${PASS}@cluster0.abcde.mongodb.net/`;
  const err = await connectDatabase({ uri: bad, dbName: "x", trackFailedCommands: true }).then(
    () => assert.fail("connected"),
    (e) => e
  );
  assert.equal(err.name, "Error");
  assert.match(err.message, /isn't a valid MongoDB connection string/);
  assert.match(err.details, /^MongoParseError/);
  for (const secret of [bad, USER, PASS]) assert.ok(!`${err.message} ${err.details}`.includes(secret));
});
