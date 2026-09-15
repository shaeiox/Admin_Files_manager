// src/config/env.js
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const config = {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    storageRoot: process.env.STORAGE_ROOT
};

// Security Check: Server must not start without a defined storage root
if (!config.storageRoot) {
    console.error('FATAL ERROR: STORAGE_ROOT environment variable is not defined.');
    process.exit(1);
}

module.exports = config;