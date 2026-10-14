// src/services/GroupService.js
'use strict';

const AppError = require('../utils/AppError');
const GroupRepository = require('../db/repositories/GroupRepository');
const UserRepository = require('../db/repositories/UserRepository');

const MAX_NAME = 64;
const MAX_DESCRIPTION = 200;

function cleanName(name) {
    const value = typeof name === 'string' ? name.trim() : '';
    if (!value || value.length > MAX_NAME) throw new AppError(`Group name must be 1-${MAX_NAME} characters.`, 400);
    return value;
}

function cleanDescription(description) {
    if (description === undefined || description === null || description === '') return null;
    if (typeof description !== 'string' || description.length > MAX_DESCRIPTION) {
        throw new AppError(`Description must be at most ${MAX_DESCRIPTION} characters.`, 400);
    }
    return description.trim() || null;
}

function mustExist(id) {
    const group = GroupRepository.findById(id);
    if (!group) throw new AppError('Group not found.', 404);
    return group;
}

/**
 * User groups (migration 4): a named set of users one file grant can cover.
 * Membership never changes a role and grants nothing by itself.
 */
class GroupService {
    list() {
        return GroupRepository.list();
    }

    create({ name, description }) {
        const clean = cleanName(name);
        if (GroupRepository.findByName(clean)) throw new AppError('A group with that name already exists.', 409);
        return GroupRepository.create(clean, cleanDescription(description));
    }

    update(id, { name, description }) {
        const group = mustExist(id);
        const clean = name === undefined ? group.name : cleanName(name);
        const clash = GroupRepository.findByName(clean);
        if (clash && clash.id !== id) throw new AppError('A group with that name already exists.', 409);
        return GroupRepository.update(id, clean, description === undefined ? group.description : cleanDescription(description));
    }

    remove(id) {
        mustExist(id);
        GroupRepository.remove(id);
    }

    /** Full replace; every id must be an existing user. */
    setMembers(id, userIds) {
        mustExist(id);
        if (!Array.isArray(userIds)) throw new AppError('userIds must be an array.', 400);
        const unique = [...new Set(userIds.map(Number))];
        for (const userId of unique) {
            if (!Number.isSafeInteger(userId) || !UserRepository.findById(userId)) {
                throw new AppError(`User not found: ${userId}`, 404);
            }
        }
        GroupRepository.setMembers(id, unique);
        return GroupRepository.list().find((g) => g.id === id);
    }
}

module.exports = new GroupService();
