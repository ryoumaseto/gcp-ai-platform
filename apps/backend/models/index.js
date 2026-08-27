const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');
const User = require('./User');
const Job = require('./Job');

// Initialize models
const models = {
  User: User(sequelize, DataTypes),
  Job: Job(sequelize, DataTypes),
};

// Associate models
Object.keys(models).forEach((modelName) => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

models.sequelize = sequelize;
models.DataTypes = DataTypes;

module.exports = models;
