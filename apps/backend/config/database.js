const { Sequelize } = require('sequelize');
require('dotenv').config();

const dialect = process.env.DB_DIALECT || 'sqlite';
const isPostgres = dialect === 'postgres';

// Cloud SQL は ip_configuration.ssl_mode = "ENCRYPTED_ONLY" のため TLS が必須。
// 一方 docker-compose のローカル postgres は TLS を持たないので、
// 一律に強制すると "The server does not support SSL connections" で起動できない。
// 既定は「postgres なら TLS あり」（安全側）とし、TLS を持たないローカル DB に
// 対してのみ DB_SSL=false で明示的に無効化する。
const sslEnabled = isPostgres && process.env.DB_SSL !== 'false';

// Private IP 経由では Google 内部 CA の証明書を検証する手段がないため
// rejectUnauthorized は false とする（経路自体は VPC 内に閉じている）。
const dialectOptions = sslEnabled
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
