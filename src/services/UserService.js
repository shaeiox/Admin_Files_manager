// src/services/UserService.js
'use strict';

const AppError = require('../utils/AppError');
const UserRepository = require('../db/repositories/UserRepository');
const { hashPassword } = require('../utils/crypto');

const MIN_PASSWORD_LENGTH = 8;

/**
 * Admin user management (ADR-009). Role is a two-value column
 * (`admin`/`user`), enforced by the database CHECK constraint - there is no
 * permission catalogue (identity/rbac-lite spec).
 */
class UserService {
    create({ username, email, password, role = 'user' }) {
        const trimmedUsername = typeof username === 'string' ? username.trim() : '';
        if (!trimmedUsername) throw new AppError('A username is required.', 400);
        if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
            throw new AppError(`A password of at least ${MIN_PASSWORD_LENGTH} characters is required.`, 400);
        }
        if (role !== 'admin' && role !== 'user') {
            throw new AppError('Role must be "admin" or "user".', 400);
        }
        if (UserRepository.findByUsername(trimmedUsername)) {
            throw new AppError('That username is already taken.', 409);
        }

        return this._publicShape(UserRepository.create({
            username: trimmedUsername,
            email: typeof email === 'string' && email.trim() ? email.trim() : null,
            passwordHash: hashPassword(password),
            role,
        }));
    }

    list() {
        return UserRepository.list().map((user) => this._publicShape(user));
    }

    setStatus(id, status) {
        if (status !== 'active' && status !== 'disabled') {
            throw new AppError('Status must be "active" or "disabled".', 400);
        }
        if (!UserRepository.findById(id)) throw new AppError('User not found.', 404);
        return this._publicShape(UserRepository.setStatus(id, status));
    }

    resetPassword(id, newPassword) {
        if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
            throw new AppError(`A password of at least ${MIN_PASSWORD_LENGTH} characters is required.`, 400);
        }
        if (!UserRepository.findById(id)) throw new AppError('User not found.', 404);
        return this._publicShape(UserRepository.setPasswordHash(id, hashPassword(newPassword)));
    }

    delete(id) {
        if (!UserRepository.findById(id)) throw new AppError('User not found.', 404);
        UserRepository.delete(id);
    }

    /** Strips password_hash and throttle bookkeeping before this ever reaches a response. */
    _publicShape(user) {
        if (!user) return null;
        const { password_hash, failed_login_count, locked_until, ...rest } = user;
        return rest;
    }
}

module.exports = new UserService();
