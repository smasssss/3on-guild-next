import { pbkdf2Sync, randomBytes } from "node:crypto";

let password = "";
for await (const chunk of process.stdin) password += chunk;
if (!password) throw new Error("Administrator password is empty");

const salt = randomBytes(16);
const iterations = 100000;
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
process.stdout.write(JSON.stringify({
  salt: salt.toString("hex"),
  hash: hash.toString("hex"),
  iterations,
}));
