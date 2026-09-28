import { createApp } from "./app.js";
import { loadLocalEnvironment, readRuntimeConfig } from "./runtime-config.js";

loadLocalEnvironment();
const runtimeConfig = readRuntimeConfig();

const app = createApp({ runtimeConfig });

try {
  await app.listen({
    port: runtimeConfig.server.port,
    host: runtimeConfig.server.host,
  });
} catch (error) {
  app.log.fatal(
    { err: error, code: "SERVER_START_FAILED" },
    "Server failed to start",
  );
  process.exitCode = 1;
}
