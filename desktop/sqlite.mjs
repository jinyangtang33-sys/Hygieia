import {DatabaseSync} from 'node:sqlite';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

// The application keeps its existing D1 queries and transaction guards. Only
// the storage transport changes; each batch is one synchronous transaction.
export function openDatabase(filename, migrations) {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  try {
    sqlite.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL)');
    sqlite.exec('CREATE TABLE IF NOT EXISTS _local_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL)');
    for (const name of readdirSync(migrations).filter(n => /^\d+.*\.sql$/.test(n)).sort()) {
      const sql = readFileSync(join(migrations, name), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const previous = sqlite.prepare('SELECT sha256 FROM _local_migrations WHERE name=?').get(name);
      if (previous) {
        if (previous.sha256 !== hash) throw Error(`数据库迁移已改变，停止启动以保护数据：${name}`);
        continue;
      }
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        sqlite.exec(sql);
        sqlite.prepare('INSERT INTO _local_migrations VALUES (?,?)').run(name, hash);
        sqlite.exec('COMMIT');
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  } catch (error) { sqlite.close(); throw error; }
  function prepare(sql, args = []) {
    return {
      bind(...values) { return prepare(sql, values); },
      async first(column) {
        const row = sqlite.prepare(sql).get(...args);
        return row ? (column ? row[column] : row) : null;
      },
      async all() { return this.execute(); },
      async run() { return this.execute(); },
      execute() {
        const statement = sqlite.prepare(sql);
        const before = sqlite.prepare('SELECT total_changes() AS n').get().n;
        // all() also executes INSERT/UPDATE, and preserves RETURNING if used.
        const results = statement.all(...args);
        const changes = sqlite.prepare('SELECT total_changes() AS n').get().n - before;
        return {success: true, results, meta: {changes}};
      },
    };
  }
  return {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = statements.map(s => s.execute());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    close() { sqlite.close(); },
  };
}
