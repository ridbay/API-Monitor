import fs from "fs";
import path from "path";
import { pool } from "./db";

async function migrate(retries = 5, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
      await pool.query(sql);
      console.log("Migration complete.");
      await pool.end();
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`Database not ready yet, retrying in ${delay}ms... (${i + 1}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
