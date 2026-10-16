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
    // A JSON body can carry any type; scrypt throws on a non-string (was a 500).
    if (typeof password !== 'string') return false;
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

/** Accepted clock skew between a DPoP proof's `iat` and the server clock. */
const DPOP_IAT_SKEW_SECONDS = 60;

const B64URL = /^[A-Za-z0-9_-]+$/;

function b64urlJson(part) {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/**
 * RFC 7638 thumbprint of a public P-256 JWK, or null when the JWK is not
 * exactly that: kty EC, crv P-256, a valid point, and no private component.
 * This is untrusted input arriving before authentication.
 */
function publicJwkThumbprint(jwk) {
    if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) return null;
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || 'd' in jwk) return null;
    if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string' || !B64URL.test(jwk.x) || !B64URL.test(jwk.y)) return null;
    try {
        crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' });
    } catch {
        return null;
    }
    const canonical = JSON.stringify({ crv: 'P-256', kty: 'EC', x: jwk.x, y: jwk.y });
    return crypto.createHash('sha256').update(canonical).digest('base64url');
}

/**
 * Verifies a DPoP proof (compact JWS, typ dpop+jwt, alg ES256, public key
 * inline as `jwk`) for one request: the key's thumbprint must equal the one
 * pinned on the session, `htm`/`htu` must name this method and path (path,
 * not full URL - design D5), `iat` must be within the skew, and the signature
 * must verify. No jti cache (design D5). Returns a boolean, never throws.
 */
function verifyDpopProof(proof, { method, path, thumbprint, now = Date.now() }) {
    try {
        if (typeof proof !== 'string' || !thumbprint) return false;
        const parts = proof.split('.');
        if (parts.length !== 3 || !parts.every((p) => B64URL.test(p))) return false;
        const header = b64urlJson(parts[0]);
        const payload = b64urlJson(parts[1]);
        if (header.typ !== 'dpop+jwt' || header.alg !== 'ES256') return false;
        if (publicJwkThumbprint(header.jwk) !== thumbprint) return false;
        if (payload.htm !== method || payload.htu !== path) return false;
        if (!Number.isFinite(payload.iat) || Math.abs(now / 1000 - payload.iat) > DPOP_IAT_SKEW_SECONDS) return false;
        const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: header.jwk.x, y: header.jwk.y }, format: 'jwk' });
        return crypto.verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key, dsaEncoding: 'ieee-p1363' },
            Buffer.from(parts[2], 'base64url'));
    } catch {
        return false;
    }
}

module.exports = { hashPassword, verifyPassword, randomToken, hashToken, publicJwkThumbprint, verifyDpopProof };
