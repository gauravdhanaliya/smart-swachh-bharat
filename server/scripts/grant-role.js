// Makes someone an official (government). This is a bootstrap tool for
// whoever runs the deployment: officials then add workers themselves, in the
// app (Workers → Add worker). Workers can't be made here, and the app never
// lets a client choose a role.
//
//   npm run grant-role -- <email> government     # supervisor / superadmin too
//   npm run grant-role -- <email> citizen        # take the role away again
//
// The email is the one the person saved their account with (Profile → "Save
// my account", or "Log in with email" → Create account). If that account has
// verified its email, it gets the role now; otherwise the role waits (pending)
// and is applied the next time the account signs in with the email verified,
// so nobody can claim a role by typing someone else's address. Re-running is
// harmless.

import { ROLES, parseRoleName } from "../src/constants.js";
import { maskEmail, normaliseEmail } from "../src/identity.js";
import { describeResult, withRepo } from "./_shared.js";

const args = process.argv.slice(2);
const [emailArg, roleArg] = args;
const ALLOWED = ROLES.filter((r) => r !== "worker");

const usage = `Usage: npm run grant-role -- <email> <government|citizen>
Roles: government (official), ${ALLOWED.filter((r) => !["citizen", "official"].includes(r)).join(", ")}, or citizen to take a role away.
Workers are added by an official in the app (the worker directory), not here.`;

const email = normaliseEmail(emailArg);
const role = parseRoleName(roleArg);
if (role === "worker") {
  console.error("Workers are added by an official in the app: the worker directory → Add worker (name and email).\n");
  console.error(usage);
  process.exit(1);
}
if (!email || !role || !ALLOWED.includes(role) || args.length !== 2) {
  console.error(!email && emailArg ? "That isn't an email address.\n" : "");
  console.error(usage);
  process.exit(1);
}

await withRepo(async (repo) => {
  const { status } = await repo.grantRole({ email, role, workerId: null });
  console.log(`${maskEmail(email)} → ${role}: ${describeResult(status)}.`);
});
