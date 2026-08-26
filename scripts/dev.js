import { spawn } from "node:child_process";

const commands = [
  spawn(process.execPath, ["--env-file-if-exists=.env", "--watch", "src/server.js"], { stdio: "inherit" }),
  spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:web"], { stdio: "inherit" })
];

function shutdown(signal) {
  for (const command of commands) command.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

for (const command of commands) {
  command.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown("SIGTERM");
      process.exitCode = code;
    }
  });
}
