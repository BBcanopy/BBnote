import { buildApp } from "./app.js";
import { buildConfig } from "./service/configService.js";

const config = buildConfig();

buildApp()
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
