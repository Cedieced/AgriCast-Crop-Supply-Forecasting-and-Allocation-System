import test from "node:test";
import assert from "node:assert/strict";
import { createDataChangeFeed } from "../src/realtime.js";

test("audit log changes are delivered to active subscribers", async () => {
  const auditRows = [];
  const queries = [];
  const pool = {
    async query(statement, values = []) {
      queries.push(statement);
      if (statement.includes("MAX(id)")) return { rows: [{ id: 0 }] };
      return { rows: auditRows.filter((row) => row.id > values[0]) };
    },
  };
  const feed = createDataChangeFeed(pool, { error() {} }, 10);
  const changes = [];
  const unsubscribe = feed.subscribe((change) => changes.push(change));

  await new Promise((resolve) => setTimeout(resolve, 5));
  auditRows.push({
    id: 1,
    table_name: "field_reports",
    operation: "INSERT",
    record_id: "report-id",
  });
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.deepEqual(changes, [{
    table: "field_reports",
    operation: "insert",
    recordId: "report-id",
  }]);
  assert.ok(queries.some((statement) => statement.includes("FROM audit_logs WHERE id > ?")));

  unsubscribe();
  feed.close();
});
