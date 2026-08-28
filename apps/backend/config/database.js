const { Sequelize } = require('sequelize');
require('dotenv').config();

const dialect = process.env.DB_DIALECT || 'sqlite';
const isPostgres = dialect === 'postgres';

// Cloud SQL は ip_configuration.ssl_mode = "ENCRYPTED_ONLY" を設定しているため、
// PostgreSQL 接続では TLS が必須。未設定だと接続が拒否される。
// Private IP 経由で Google 内部 CA の証明書を検証する手段がないため
// rejectUnauthorized は false とする（経路自体は VPC 内に閉じている）。
const dialectOptions = isPostgres
  ? {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    }
  : {};

const sequelize = new Sequelize({
  dialect,
  storage: process.env.DB_STORAGE || './database.sqlite',
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'app_maker',
  logging: process.env.NODE_ENV === 'production' ? false : console.log,
  dialectOptions,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

module.exports = sequelize;
