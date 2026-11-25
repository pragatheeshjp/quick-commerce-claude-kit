import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();
// Bind 0.0.0.0 so the port is reachable from outside the container.
const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
