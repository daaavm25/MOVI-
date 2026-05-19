const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

const User = sequelize.define('User', {
    username: {
        type: DataTypes.STRING(60),
        allowNull: false,
        unique: true,
        validate: { len: [3, 60] }
    },
    email: {
        type: DataTypes.STRING(120),
        allowNull: false,
        unique: true,
        validate: { isEmail: true }
    },
    password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    salt: {
        type: DataTypes.STRING(32),
        allowNull: true
    },
    birth_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    }
}, { timestamps: true });

// Async — returns bcrypt hash (salt embedded)
User.hashPassword = async function (plain) {
    return bcrypt.hash(plain, SALT_ROUNDS);
};

// Async — safe timing-safe comparison
User.verifyPassword = async function (plain, hash) {
    return bcrypt.compare(plain, hash);
};

module.exports = User;
