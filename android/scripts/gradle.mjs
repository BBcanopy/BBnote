import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const windows = process.platform === "win32";
const child = spawn(windows ? "gradlew.bat" : "sh", windows ? process.argv.slice(2) : ["./gradlew", ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL("../android", import.meta.url)),
  stdio: "inherit",
  shell: windows
});
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
