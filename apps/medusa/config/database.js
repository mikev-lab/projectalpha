const { inMemory } = require("@medusajs/utils");

module.exports = {
  database: inMemory.getDatabase(),
};
