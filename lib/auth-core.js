import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(String(password), salt, 210000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$210000$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [scheme, iterations, salt, expected] = String(storedHash || "").split("$");
  if (scheme !== "pbkdf2_sha256" || !iterations || !salt || !expected) return false;
  const actual = pbkdf2Sync(String(password), salt, Number(iterations), 32, "sha256");
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && timingSafeEqual(actual, expectedBuffer);
}

export function safeUser(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}
