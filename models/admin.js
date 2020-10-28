'use strict';
const { Model } = require('sequelize');
const bcrypt = require('bcrypt');
module.exports = (sequelize, DataTypes) => {
  class Admin extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Admin.init(
    {
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      hooks: {
        beforeSave: async (admin) => {
          const hash = await bcrypt.hash(admin.password, 10);
          admin.password = hash;
        },
      },
      sequelize,
      modelName: 'Admin',
    }
  );
  Admin.prototype.isValidPassword = async function (password) {
    const admin = this;
    const compare = await bcrypt.compare(password, admin.password);

    return compare;
  };

  return Admin;
};
