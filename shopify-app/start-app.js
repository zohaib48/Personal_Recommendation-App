const { spawn, execSync } = require("child_process");
const { existsSync } = require("fs");
const { readFile, writeFile } = require("fs").promises;
const { basename, join } = require("path");
const net = require("net");

function resolveTomlPath() {
  const explicit = process.env.SHOPIFY_APP_CONFIG;
  if (explicit) {
    return explicit.includes("/") ? explicit : join(__dirname, explicit);
  }

  const localPath = join(__dirname, "shopify.app.local.toml");
  if (existsSync(localPath)) return localPath;

  return join(__dirname, "shopify.app.toml");
}

const CONFIG = {
  nodePort: 3000,
  // 3001 is commonly occupied on Windows dev machines; use a higher default.
  adminPort: 4000,
  flaskPort: 5001,
  tomlPath: resolveTomlPath(),
  envPath: join(__dirname, ".env"),
  flaskPath: join(__dirname, "..", "Flask Project"),
  urlWaitTimeout: 30000,
};

const FLAGS = new Set(process.argv.slice(2));
const should = (flag) => !FLAGS.has(flag);

class ShopifyAppLauncher {
  constructor() {
    this.tunnelUrl = null;
    this.tunnelProcess = null;
    this.serverProcess = null;
    this.adminProcess = null;
    this.flaskProcess = null;
    this.adminRetries = 0;
  }

  /**
   * Most reliable port check: try to actually bind.
   * This catches Windows IPv6 bindings like :::3001 that other checks miss.
   */
  async canBindPort(port) {
    const tryBind = (host) =>
      new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.once("error", () => resolve(false));
        server.listen({ port, host, exclusive: true }, () => {
          server.close(() => resolve(true));
        });
      });

    // On Windows, a port might be occupied on IPv4-only or IPv6-only.
    // Treat it as "free" only if we can bind on BOTH stacks.
    const ipv6Ok = await tryBind("::");
    if (!ipv6Ok) return false;
    const ipv4Ok = await tryBind("0.0.0.0");
    return ipv4Ok;
  }

  isPortInUse(port) {
    try {
      if (process.platform === "win32") {
        // Use PowerShell for reliable IPv4/IPv6 detection on Windows.
        // Return a numeric count to avoid parsing issues.
        const countRaw = execSync(
          `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"`,
          { encoding: "utf8" }
        );
        const count = Number(String(countRaw).trim());
        if (Number.isFinite(count) && count > 0) return true;

        // Fallback to netstat if Get-NetTCPConnection is unavailable
        const output = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
        return output.split("\n").some((line) => line.toUpperCase().includes("LISTENING"));
      }
      execSync(`lsof -ti:${port}`, { stdio: "ignore" });
      return true;
    } catch (error) {
      return false;
    }
  }

  // Synchronous fallback (non-Windows). On Windows we use getAvailablePortAsync().
  getAvailablePort(startPort) {
    let port = startPort;
    while (this.isPortInUse(port)) {
      port += 1;
    }
    return port;
  }

  async getAvailablePortAsync(startPort) {
    let port = startPort;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Fast path for non-Windows
      if (process.platform !== "win32") {
        if (!this.isPortInUse(port)) return port;
        port += 1;
        continue;
      }

      // Windows: use bind-probe to catch :::PORT listeners
      // Also avoid ports that look in use per PowerShell/netstat.
      const looksFree = !this.isPortInUse(port);
      const bindable = await this.canBindPort(port);
      if (looksFree && bindable) return port;

      port += 1;
    }
  }

  async waitForPortFree(port, timeoutMs = 5000) {
    const start = Date.now();
    while (process.platform === "win32" ? !(await this.canBindPort(port)) : this.isPortInUse(port)) {
      if (Date.now() - start > timeoutMs) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return true;
  }

  async killPort(port) {
    try {
      if (process.platform === "win32") {
        try {
          execSync(
            `powershell -NoProfile -Command "$pids = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($pids) { $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"`,
            { stdio: "ignore" }
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          // fallback to netstat
        }

        try {
          const output = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
          const lines = output.split("\n").filter((line) => line.includes("LISTENING"));
          const pids = Array.from(
            new Set(
              lines
                .map((line) => line.trim().split(/\s+/).pop())
                .filter((pid) => pid && pid !== "0")
            )
          );

          if (pids.length > 0) {
            pids.forEach((pid) => {
              execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          // ignore
        }
      } else {
        try {
          execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: "ignore" });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          // ignore
        }
      }
    } catch (error) {
      return;
    }
  }

  async start() {
    try {
      console.log("Starting Shopify app automation...\n");

      await this.killPort(CONFIG.nodePort);
      await this.killPort(CONFIG.adminPort);
      await this.killPort(CONFIG.flaskPort);

      await this.waitForPortFree(CONFIG.nodePort);
      await this.waitForPortFree(CONFIG.adminPort);
      await this.waitForPortFree(CONFIG.flaskPort);

      CONFIG.nodePort = await this.getAvailablePortAsync(CONFIG.nodePort);
      CONFIG.adminPort = await this.getAvailablePortAsync(CONFIG.adminPort);
      // Ensure admin port doesn't collide with node port
      if (CONFIG.adminPort === CONFIG.nodePort) {
        CONFIG.adminPort = await this.getAvailablePortAsync(CONFIG.adminPort + 1);
      }
      console.log(`Using ports -> Node: ${CONFIG.nodePort}, Admin: ${CONFIG.adminPort}, Flask: ${CONFIG.flaskPort}`);

      if (should("--skip-flask")) {
        await this.startFlask();
      }

      // Quick tunnels only work while the `cloudflared` process is running.
      // So by default we always start a fresh quick tunnel.
      // Use `--use-existing-tunnel` ONLY if you are running your own named tunnel
      // and `SHOPIFY_HOST` points at it.
      if (FLAGS.has("--use-existing-tunnel")) {
        await this.useExistingHost();
      } else {
        await this.startTunnel();
      }

      await this.updateConfigurations();

      if (should("--skip-deploy")) {
        await this.deployToShopify();
      }

      if (should("--skip-admin")) {
        await this.startAdmin();
      }

      await this.startServer();
    } catch (error) {
      console.error("Fatal error:", error.message);
      await this.cleanup();
      process.exit(1);
    }
  }

  async startTunnel() {
    console.log("Starting Cloudflare tunnel...");

    return new Promise((resolve, reject) => {
      this.tunnelProcess = spawn(
        "cloudflared",
        ["tunnel", "--url", `http://localhost:${CONFIG.nodePort}`],
        { shell: true }
      );

      const timeout = setTimeout(() => {
        reject(new Error("Tunnel URL not found within timeout"));
      }, CONFIG.urlWaitTimeout);

      const handleData = (data) => {
        const output = data.toString();
        process.stdout.write(output);

        const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !this.tunnelUrl) {
          this.tunnelUrl = match[0];
          clearTimeout(timeout);
          console.log(`\nTunnel URL captured: ${this.tunnelUrl}\n`);
          resolve(this.tunnelUrl);
        }
      };

      this.tunnelProcess.stdout.on("data", handleData);
      this.tunnelProcess.stderr.on("data", handleData);
      this.tunnelProcess.on("error", (error) => {
        clearTimeout(timeout);
        reject(new Error(`Tunnel failed: ${error.message}`));
      });
    });
  }

  async useExistingHost() {
    const content = await readFile(CONFIG.envPath, "utf8");
    const match = content.match(/^SHOPIFY_HOST=(.+)$/m);
    if (!match) {
      throw new Error("SHOPIFY_HOST not found in .env. Remove --skip-tunnel to generate one.");
    }
    this.tunnelUrl = match[1].trim();
    console.log(`Using existing SHOPIFY_HOST: ${this.tunnelUrl}`);
  }

  async updateConfigurations() {
    console.log("Updating configuration files...\n");
    await this.updateToml();
    await this.updateEnv();
    console.log("Configuration update complete.\n");
  }

  async updateToml() {
    if (!existsSync(CONFIG.tomlPath)) {
      throw new Error(`Shopify app config not found: ${CONFIG.tomlPath}`);
    }

    let content = await readFile(CONFIG.tomlPath, "utf8");
    content = content
      .split("\n")
      .filter((line) => !line.trim().startsWith("param($m)"))
      .join("\n");

    // IMPORTANT:
    // Keep application_url at the tunnel root so Shopify's post-install redirect
    // lands on `/` where we can reliably start the auth flow and then send the
    // merchant into `/app`.
    if (content.match(/application_url = ".*"/)) {
      content = content.replace(
        /application_url = ".*"/,
        `application_url = "${this.tunnelUrl}"`
      );
    } else {
      content = content.replace(
        /name = ".*"\n/,
        (match) => `${match}application_url = "${this.tunnelUrl}"\n`
      );
    }

    content = content.replace(
      /redirect_urls = \[[^\]]*\]/,
      `redirect_urls = [ "${this.tunnelUrl}/auth/callback" ]`
    );

    // Keep app proxy URL in sync with the tunnel
    if (content.match(/\[app_proxy\]/)) {
      content = content.replace(
        /(\[app_proxy\]\s*\n\s*url\s*=\s*)"[^"]*"/,
        `$1"${this.tunnelUrl}"`
      );
    }

    await writeFile(CONFIG.tomlPath, content, "utf8");
    console.log(`  updated ${basename(CONFIG.tomlPath)}`);
  }

  async updateEnv() {
    let content = await readFile(CONFIG.envPath, "utf8");

    if (!content.match(/^SHOPIFY_HOST=/m)) {
      content += `\nSHOPIFY_HOST=${this.tunnelUrl}\n`;
    } else {
      content = content.replace(/^SHOPIFY_HOST=.*/m, `SHOPIFY_HOST=${this.tunnelUrl}`);
    }

    await writeFile(CONFIG.envPath, content, "utf8");
    console.log("  updated .env");
  }

  async deployToShopify() {
    console.log("Deploying to Shopify...\n");

    const deployArgs = ["app", "deploy", "--force"];
    const configFile = basename(CONFIG.tomlPath);
    if (configFile !== "shopify.app.toml") {
      deployArgs.push("--config", configFile);
      console.log(`Using Shopify config: ${configFile}`);
    }

    return new Promise((resolve) => {
      const deploy = spawn("shopify", deployArgs, {
        stdio: "inherit",
        shell: true,
      });

      deploy.on("close", (code) => {
        if (code === 0) {
          console.log("\nDeploy complete.\n");
        } else {
          console.log("\nDeploy finished with warnings. Check CLI output.\n");
        }
        resolve();
      });

      deploy.on("error", () => {
        console.log("\nDeploy failed, continuing...\n");
        resolve();
      });
    });
  }

  async startFlask() {
    console.log("Starting Flask API...\n");

    const pythonBin = this.resolvePythonBin();
    this.flaskProcess = spawn(`"${pythonBin}"`, ["-m", "api.app"], {
      cwd: CONFIG.flaskPath,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, PYTHONUNBUFFERED: "1", FLASK_DEBUG: "true" },
    });

    this.flaskProcess.on("close", (code) => {
      console.log(`\nFlask API exited with code ${code}`);
    });
  }

  async startServer() {
    console.log("Starting Node.js server...\n");
    console.log("-".repeat(50));
    console.log(`App URL: ${this.tunnelUrl}`);
    console.log(`Auth URL: ${this.tunnelUrl}/auth`);
    console.log(`Callback: ${this.tunnelUrl}/auth/callback`);
    console.log("-".repeat(50) + "\n");

    this.serverProcess = spawn("npm", ["run", "dev"], {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, PORT: CONFIG.nodePort, ADMIN_PORT: CONFIG.adminPort },
    });

    this.serverProcess.on("close", (code) => {
      console.log(`\nNode server exited with code ${code}`);
      this.cleanup();
      process.exit(code);
    });
  }

  async startAdmin() {
    console.log("Starting Remix admin UI...\n");

    this.adminProcess = spawn("npm", ["run", "dev:admin"], {
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        PORT: CONFIG.adminPort,
        NODE_API_URL: `http://localhost:${CONFIG.nodePort}`,
        ANALYTICS_API_URL: `http://localhost:${CONFIG.nodePort}`,
      },
    });

    this.adminProcess.on("close", (code) => {
      console.log(`\nAdmin UI exited with code ${code}`);
    });
  }

  async cleanup() {
    console.log("\nShutting down...\n");

    if (this.serverProcess) {
      this.serverProcess.kill();
    }
    if (this.adminProcess) {
      this.adminProcess.kill();
    }
    if (this.flaskProcess) {
      this.flaskProcess.kill();
    }
    if (this.tunnelProcess) {
      this.tunnelProcess.kill();
    }

    await this.killPort(CONFIG.nodePort);
    await this.killPort(CONFIG.adminPort);
    await this.killPort(CONFIG.flaskPort);
  }

  resolvePythonBin() {
    if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;

    // Prefer the venv inside "Flask Project" where Flask deps are installed
    const flaskVenvPython =
      process.platform === "win32"
        ? join(CONFIG.flaskPath, ".venv", "Scripts", "python.exe")
        : join(CONFIG.flaskPath, ".venv", "bin", "python");

    if (existsSync(flaskVenvPython)) return flaskVenvPython;

    // Fallback to repo-root .venv
    const repoRoot = join(__dirname, "..");
    const venvPython =
      process.platform === "win32"
        ? join(repoRoot, ".venv", "Scripts", "python.exe")
        : join(repoRoot, ".venv", "bin", "python");

    if (existsSync(venvPython)) return venvPython;

    return process.platform === "win32" ? "python" : "python3";
  }
}

const launcher = new ShopifyAppLauncher();

process.on("SIGINT", async () => {
  await launcher.cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await launcher.cleanup();
  process.exit(0);
});

launcher.start();
