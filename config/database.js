const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), override: true });

const { Sequelize } = require('sequelize');

const databaseUrl = String(process.env.DATABASE_URL || '').trim();

const sequelize = databaseUrl
    ? new Sequelize(databaseUrl, {
        dialect: 'postgres',
        logging: false
    })
    : new Sequelize(
        String(process.env.DB_NAME || 'postgres'),
        String(process.env.DB_USER || 'postgres'),
        String(process.env.DB_PASSWORD || ''),
        {
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT || 5432),
            dialect: 'postgres',
            logging: false
        }
    );

module.exports = sequelize;