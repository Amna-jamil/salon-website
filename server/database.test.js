import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, transaction, getSettings } from "./database.js";

test("an awaited SQLite transaction rolls back without rolling back a concurrent caller's queued write", async () => {
  const db = openDatabase(":memory:");
  let release, entered;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  try {
    const failed = transaction(db, async () => {
      await db.exec("UPDATE settings SET revision=100 WHERE id=1");
      entered();
      await gate;
      throw new Error("Rollback verification");
    });
    const rejection = assert.rejects(failed, /Rollback verification/);
    await ready;
    const independent = db.exec(
      "UPDATE settings SET revision=revision+1 WHERE id=1",
    );
    release();
    await rejection;
    await independent;
    assert.equal((await getSettings(db)).revision, 2);
  } finally {
    await db.close();
  }
});
