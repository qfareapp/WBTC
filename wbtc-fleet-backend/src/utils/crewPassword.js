const bcrypt = require("bcrypt");

const DEFAULT_CREW_PASSWORD = "Welcome@qfare";

const hashPassword = async (password) => bcrypt.hash(password, 10);
const comparePassword = async (plainText, hash) => bcrypt.compare(plainText, hash);

module.exports = {
  DEFAULT_CREW_PASSWORD,
  hashPassword,
  comparePassword,
};
