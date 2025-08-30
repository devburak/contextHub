// Export all models
const models = require('./models');

// Export database connection utilities
const database = require('./database');

module.exports = {
  ...models,
  database
};
