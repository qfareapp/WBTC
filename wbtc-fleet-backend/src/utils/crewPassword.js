const bcrypt = require("bcrypt");

const hashPassword = async (password) => bcrypt.hash(password, 10);
const comparePassword = async (plainText, hash) => bcrypt.compare(plainText, hash);
const randomChar = (charset) => charset[Math.floor(Math.random() * charset.length)];

const generateTemporaryPassword = (length = 12) => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "@#$%&*!";
  const all = `${upper}${lower}${digits}${symbols}`;

  const chars = [
    randomChar(upper),
    randomChar(lower),
    randomChar(digits),
    randomChar(symbols),
  ];

  while (chars.length < length) {
    chars.push(randomChar(all));
  }

  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }

  return chars.join("");
};

module.exports = {
  hashPassword,
  comparePassword,
  generateTemporaryPassword,
};
