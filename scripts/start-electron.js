const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const workspaceRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(workspaceRoot, "desktop-runtime");
const electronCli = path.join(runtimeRoot, "node_modules", "electron", "cli.js");

if (!fs.existsSync(electronCli)) {
  console.error("Electron runtime is not installed. Run: npm.cmd run setup");
  process.exit(1);
}

const child = spawn(process.execPath, [electronCli, workspaceRoot], {
  cwd: workspaceRoot,
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
