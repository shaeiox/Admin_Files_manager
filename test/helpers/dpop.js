// test/helpers/dpop.js
'use strict';

const crypto = require('node:crypto');

/**
 * A P-256 device key and a DPoP proof builder matching what api.js produces
 * with WebCrypto: compact JWS, ES256, raw r||s signature, public JWK inline.
 */
function deviceKey() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const { kty, crv, x, y } = publicKey.export({ format: 'jwk' });
    const jwk = { kty, crv, x, y };

    function proof({ method = 'POST', path = '/api/v1/auth/refresh', iat = Math.floor(Date.now() / 1000), header = {} } = {}) {
        const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
        const h = enc({ typ: 'dpop+jwt', alg: 'ES256', jwk, ...header });
        const p = enc({ htm: method, htu: path, iat, jti: crypto.randomUUID() });
        const sig = crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key: privateKey, dsaEncoding: 'ieee-p1363' });
        return `${h}.${p}.${sig.toString('base64url')}`;
    }

    return { jwk, proof };
}

module.exports = { deviceKey };
