// src/utils/crypto.js
'use strict';

const crypto = require('crypto');

/** Key length for scrypt-derived password hashes, in bytes. */
const SCRYPT_KEYLEN = 64;

/**
 * Hashes a password with a random salt via scrypt (stdlib, memory-hard).
 * Returns "salt:hash", both hex, so verification needs no separate column.
 */
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
    return `${salt}:${hash}`;
}

/** Verifies a password against a "salt:hash" string with a timing-safe comparison. */
function verifyPassword(password, stored) {
    const [salt, hashHex] = String(stored || '').split(':');
    if (!salt || !hashHex) return false;
    const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(hashHex, 'hex');
    if (candidate.length !== expected.length) return false;
    return crypto.timingSafeEqual(candidate, expected);
}

/** A high-entropy opaque token (session id, CSRF secret). Never stored raw. */
function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

/** A one-way hash of a token for storage (ADR-009: only the hash is persisted). */
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { hashPassword, verifyPassword, randomToken, hashToken };
