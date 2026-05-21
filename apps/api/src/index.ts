import { loadConfig } from "./config.js";
import { openDatabase } from "./db/connection.js";
import { createServer } from "./server.js";

const config = loadConfig();
process.env.TZ = config.APP_TIMEZONE;
const db = openDatabase(config.DATABASE_PATH);
const app = createServer(config, db);

app.listen(config.PORT, config.HOST, () => {
  console.log(`its-personal listening on http://${config.HOST}:${config.PORT}`);
});
