import assert from "node:assert/strict";
import { hashPassword, normalizeEmail, safeUser, verifyPassword } from "../lib/auth.js";

assert.equal(normalizeEmail("  Test@Example.COM "), "test@example.com");
assert.equal(normalizeEmail(null), "");

const hash = hashPassword("correct horse battery staple");
assert.ok(hash.startsWith("pbkdf2_sha256$210000$"));
assert.equal(verifyPassword("correct horse battery staple", hash), true);
assert.equal(verifyPassword("wrong password", hash), false);
assert.equal(verifyPassword("anything", "invalid"), false);

const user = safeUser({
  id: 42,
  email: "user@example.com",
  full_name: "User Test",
  role: "user",
  status: "active",
  created_at: "2026-10-05T00:00:00.000Z",
  last_login_at: null,
  password_hash: "must-not-leak"
});
assert.deepEqual(user, {
  id: "42",
  email: "user@example.com",
  fullName: "User Test",
  role: "user",
  status: "active",
  createdAt: "2026-10-05T00:00:00.000Z",
  lastLoginAt: null
});
assert.equal("password_hash" in user, false);

console.log("Authentication unit tests: OK");
