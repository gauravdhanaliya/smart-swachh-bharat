// Gives a user a role. This is the ONLY way anyone becomes a worker or a
// government official — the app never lets a client choose a role.
//
//   npm run grant-role -- <phone> <citizen|worker|government> [--worker-id w1]
//
// Updates the user with that phone number in MongoDB. If nobody has signed in
// with it yet, the role is stored as pending and applied at their first
// sign-in. Re-running is harmless. "government" is the app's `official` role;
// supervisor and superadmin are accepted too.
//
// --worker-id links a worker to one of the demo worker records (w1, w2…) so
// they see that worker's demo facility requests.

import { ROLES, parseRoleName } from "../src/constants.js";
import { describeResult, maskPhone, normalisePhone, withRepo } from "./_shared.js";

const args = process.argv.slice(2);
const flag = args.indexOf("--worker-id");
const workerId = flag >= 0 ? args.splice(flag, 2)[1] : null;
const [phoneArg, roleArg] = args;

const usage = `Usage: npm run grant-role -- <phone> <citizen|worker|government> [--worker-id w1]
Roles: ${["citizen", "worker", "government", ...ROLES.filter((r) => !["citizen", "worker", "official"].includes(r))].join(", ")}`;

const phone = normalisePhone(phoneArg);
const role = parseRoleName(roleArg);
if (!phone || !role) {
  console.error(!phone && phoneArg ? "That isn't a valid 10-digit Indian mobile number.\n" : "");
  console.error(usage);
  process.exit(1);
}
if (workerId !== null && !/^[A-Za-z0-9_-]{1,24}$/.test(workerId)) {
  console.error("--worker-id may only contain letters, digits, - and _ (max 24).");
  process.exit(1);
}

await withRepo(async (repo) => {
  const { status } = await repo.grantRole({ phone, role, workerId });
  console.log(`${maskPhone(phone)} → ${role}${workerId ? ` (worker ${workerId})` : ""}: ${describeResult(status)}.`);
});
