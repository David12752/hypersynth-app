const http = require("http");
const net = require("net");
const { spawn } = require("child_process");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const preferredPorts = [3000, 3001, 3002, 3003, 3004, 3005];

let nextProcess;
let electronProcess;
let shuttingDown = false;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port);
  });
}

async function getDevPort() {
  for (const port of preferredPorts) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to resolve an available port")));
        return;
      }

      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(port);
      });
    });

    server.listen(0);
  });
}

function waitForServer(url, timeoutMs = 60000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }

      const request = http.get(url, (response) => {
        response.resume();

        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }

        setTimeout(attempt, 500);
      });

      request.on("error", () => {
        setTimeout(attempt, 500);
      });
    };

    attempt();
  });
}

function terminateChildren(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill();
  }

  if (nextProcess && !nextProcess.killed) {
    nextProcess.kill();
  }

  process.exit(exitCode);
}

async function main() {
  const port = await getDevPort();
  const devUrl = `http://localhost:${port}`;
  const sharedEnv = {
    ...process.env,
    ELECTRON_START_URL: devUrl,
    NODE_ENV: "development",
  };

  console.log(`Starting HyperSynth Electron dev on ${devUrl}`);

  nextProcess = spawn(`npm run dev -- --port ${port}`, {
    cwd: rootDir,
    env: sharedEnv,
    stdio: "inherit",
    shell: true,
  });

  nextProcess.on("exit", (code) => {
    if (shuttingDown) {
      return;
    }

    console.error(`Next.js dev server exited with code ${code ?? 0}`);
    terminateChildren(code ?? 1);
  });

  await waitForServer(devUrl);

  electronProcess = spawn("npm exec -- electron .", {
    cwd: rootDir,
    env: sharedEnv,
    stdio: "inherit",
    shell: true,
  });

  electronProcess.on("exit", (code) => {
    if (shuttingDown) {
      return;
    }

    terminateChildren(code ?? 0);
  });
}

process.on("SIGINT", () => terminateChildren(0));
process.on("SIGTERM", () => terminateChildren(0));

main().catch((error) => {
  console.error(error);
  terminateChildren(1);
});