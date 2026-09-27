import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const host = process.env.HOST ?? "127.0.0.1";

const app = createApp();

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.fatal({ err: error, code: "SERVER_START_FAILED" }, "Server failed to start");
  process.exitCode = 1;
}
