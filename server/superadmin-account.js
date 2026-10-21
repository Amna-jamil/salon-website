import { openConfiguredDatabase } from "./database.js";
import { promoteSuperadmin } from "./auth.js";

const email = process.argv[2];
if (!email)
  throw new Error(
    "Usage: npm run superadmin:promote -- existing-admin@example.com",
  );
const db = await openConfiguredDatabase();
try {
  await promoteSuperadmin(db, email);
  console.log(
    "Existing admin promoted to superadmin. Password unchanged. Sign in at /admin/login.",
  );
} finally {
  await db.close();
}
