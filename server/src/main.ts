import { buildApp } from "./app.js";
import { buildConfig } from "./service/configService.js";
import { createEnvTestAuth } from "./service/oidcTesting.js";

const config = buildConfig();
const authTesting = process.env.BBNOTE_TEST_AUTH_ENABLED === "true" ? createEnvTestAuth(config) : undefined;

buildApp({ config, authTesting })
  .then((app) =>
    app.listen({ host: "0.0.0.0", port: config.port }).catch((error: unknown) => {
      app.log.error(error);
      process.exit(1);
    })
  )
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
