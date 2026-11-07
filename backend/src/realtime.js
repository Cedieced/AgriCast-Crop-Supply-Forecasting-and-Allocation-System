export function createDataChangeFeed(pool, logger = console, pollIntervalMs = 1000) {
  const subscribers = new Set();
  let closed = false;
  let timer;
  let polling = false;
  let lastId = 0;

  async function poll() {
    if (closed || polling) return;
    polling = true;
    try {
      if (lastId === 0) {
        const latest = await pool.query("SELECT COALESCE(MAX(id), 0) AS id FROM audit_logs");
        lastId = Number(latest.rows[0].id);
      }
      const { rows } = await pool.query(
        "SELECT id, table_name, operation, record_id FROM audit_logs WHERE id > ? ORDER BY id",
        [lastId],
      );
      for (const row of rows) {
        lastId = Number(row.id);
        const change = {
          table: row.table_name,
          operation: row.operation.toLowerCase(),
          recordId: row.record_id,
        };
        for (const subscriber of subscribers) {
          try {
            subscriber(change);
          } catch (error) {
            logger.error("Database change subscriber failed:", error);
          }
        }
      }
    } catch (error) {
      logger.error("Could not poll database changes:", error);
    } finally {
      polling = false;
    }
  }

  poll();
  timer = setInterval(poll, pollIntervalMs);
  timer.unref?.();

  return {
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    close() {
      closed = true;
      clearInterval(timer);
      subscribers.clear();
    },
  };
}
