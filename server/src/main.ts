import { buildApp } from "./app.js";
import { buildConfig } from "./service/configService.js";

const app = buildApp();
const config = buildConfig();

app.listen({ host: "0.0.0.0", port: config.port }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
