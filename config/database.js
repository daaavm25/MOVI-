const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { Sequelize } = require('sequelize');

const databaseUrl = String(process.env.DATABASE_URL || '').trim();

function requireEnv(name) {
    const value = process.env[name];

    if (typeof value !== 'string') {
        throw new Error(`Falta la variable de entorno requerida: ${name}`);
    }

    return value;
}

const sequelize = databaseUrl
    ? new Sequelize(databaseUrl, {
        dialect: 'postgres',
        logging: false
    })
    : new Sequelize(
        requireEnv('DB_NAME'),
        requireEnv('DB_USER'),
        requireEnv('DB_PASSWORD'),
        {
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT || 5432),
            dialect: 'postgres',
            logging: false
        }
    );

module.exports = sequelize;