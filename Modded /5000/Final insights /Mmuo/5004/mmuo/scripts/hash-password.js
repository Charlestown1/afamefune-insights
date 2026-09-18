/**
 * Run this locally (never on a public server) to generate the bcrypt hash
 * for your admin password:
 *
 *   npm run hash-password
 *
 * It will prompt you for a password and print the hash to paste into
 * ADMIN_PASSWORD_HASH in your .env / Render environment variables.
 */
const bcrypt = require("bcryptjs");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Enter the admin password to hash: ", async (password) => {
  if (!password || password.length < 10) {
    console.error("Password should be at least 10 characters.");
    rl.close();
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  console.log("\nAdd this to your environment variables as ADMIN_PASSWORD_HASH:\n");
  console.log(hash);
  console.log("\nDo not commit this value or the plain password to Git.\n");
  rl.close();
});
