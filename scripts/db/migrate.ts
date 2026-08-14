import "../env";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Client } from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error(
      "SUPABASE_DB_URL is not set. Copy .env.example to .env.local and add the connection\n" +
        "string from Supabase → Project Settings → Database → Connection string (URI).",
    );
    process.exit(1);
  }

  const reset = process.argv.includes("--reset");
  const client = new Client({
    connectionString,
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    if (reset) {
      console.log("Dropping and recreating the public schema…");
      await client.query("drop schema public cascade; create schema public;");
      await client.query("grant usage on schema public to anon, authenticated, service_role;");
    }

    await client.query(`
      create table if not exists schema_migrations (
        filename   text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      );
    `);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const { rows } = await client.query<{ filename: string; checksum: string }>(
      "select filename, checksum from schema_migrations",
    );
    const applied = new Map(rows.map((r) => [r.filename, r.checksum]));

    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex").slice(0, 16);
      const previous = applied.get(file);

      if (previous === checksum) {
        console.log(`  = ${file}`);
        continue;
      }
      if (previous && previous !== checksum) {
        throw new Error(
          `${file} has changed since it was applied. Add a new migration instead, or run with --reset.`,
        );
      }

      process.stdout.write(`  + ${file} … `);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into schema_migrations (filename, checksum) values ($1, $2)",
          [file, checksum],
        );
        await client.query("commit");
        console.log("done");
      } catch (error) {
        await client.query("rollback");
        console.log("failed");
        throw error;
      }
    }

    console.log(`\n${files.length} migration${files.length === 1 ? "" : "s"} up to date.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
