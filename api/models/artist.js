'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Artist extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  };
  Artist.init({
    ticketNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      validate: {
        min: 0,
        max: 70,
      }

    },
    vote: {
      type: DataTypes.STRING,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Artist',
  });
  return Artist;
};