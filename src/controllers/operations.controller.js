// src/controllers/operations.controller.js
'use strict';

const OperationService = require('../services/OperationService');
const AppError = require('../utils/AppError');

/**
 * GET /api/operations/:id
 *
 * A BARE object, matching the read-only aggregate convention: there is no
 * `{ success }` envelope on a status read.
 *
 * UNKNOWN IS NORMAL. The registry is in-process (ADR-008), so an operation that
 * was never created, has aged out of retention, or belongs to a different
 * session all read the same way: 404. That is deliberate - a client must not be
 * able to probe for the existence of another session's operations - and the
 * caller is expected to treat it as "stop tracking", not as a retryable error.
 */
async function getOperation(req, res, next) {
    try {
        const { id } = req.params;
        // `authenticate` attaches req.session (ADR-009); the session id is what
        // owns the operation. It is always present on this route - the router is
        // mounted behind `authenticate` - but is read defensively so a missing
        // session can never widen access to null-owned records.
        const sessionId = (req.session && req.session.id) || null;
        const snapshot = OperationService.snapshot(id, sessionId);

        if (!snapshot) {
            throw new AppError('Operation not found.', 404);
        }

        res.json(snapshot);
    } catch (error) {
        next(error);
    }
}

module.exports = { getOperation };