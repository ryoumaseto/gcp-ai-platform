const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const Job = sequelize.define(
    'Job',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      appName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      prompt: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(
          'pending',
          'parsing',
          'design_review',
          'approved',
          'generating',
          'testing',
          'deployed',
          'failed'
        ),
        defaultValue: 'pending',
      },
      language: {
        type: DataTypes.STRING(50),
        defaultValue: 'TypeScript',
      },
      dbType: {
        type: DataTypes.STRING(50),
        defaultValue: 'PostgreSQL',
      },
      model: {
        type: DataTypes.STRING(50),
        defaultValue: 'gemini-flash-latest',
      },
      progress: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      designDocument: {
        type: DataTypes.TEXT,
      },
      generatedCode: {
        type: DataTypes.TEXT,
      },
      appUrl: {
        type: DataTypes.STRING(255),
      },
      error: {
        type: DataTypes.TEXT,
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      deployedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      timestamps: true,
      indexes: [
        {
          fields: ['userId', 'status'],
        },
        {
          fields: ['createdAt'],
        },
      ],
    }
  );

  Job.associate = (models) => {
    Job.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });
  };

  return Job;
};
