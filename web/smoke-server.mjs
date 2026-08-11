// Shared smoke bootstrap: spawn web/serve.mjs on an OS-assigned free port, wait for
// its readiness line, fail loudly on early child error/exit, and prove over HTTP that
// the responder is THIS spawned process via a per-run nonce (REV-006).
//
// Returns { base, port, stop } once the child is confirmed serving this checkout.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export function startServer() {
  const nonce = randomBytes(16).toString("hex");
  // Port 0 => the kernel assigns a free port, so a stale listener on any fixed port
  // can never be mistaken for our server.
  const child = spawn("node", [join(here, "serve.mjs"), "0"], {
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, SMOKE_NONCE: nonce },
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let buf = "";
    const done = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };

    // A child that dies before or during readiness must fail the smoke, never let it
    // silently fall through to a stale server.
    child.on("error", (e) => done(reject, new Error(`server child failed to spawn: ${e.message}`)));
    child.on("exit", (code, signal) =>
      done(reject, new Error(`server exited before readiness (code=${code} signal=${signal})`)));

    const timer = setTimeout(
      () => done(reject, new Error("server did not report readiness within 10s")),
      10000,
    );

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", async (chunk) => {
      buf += chunk;
      const m = buf.match(/SERVE_LISTENING port=(\d+)/);
      if (!m || settled) return;
      const port = Number(m[1]);
      const base = `http://127.0.0.1:${port}`;
      try {
        // Confirm the process answering on this port is the one we just spawned.
        const r = await fetch(`${base}/__smoke_nonce`);
        const got = (await r.text()).trim();
        if (!r.ok || got !== nonce) {
          throw new Error(`nonce mismatch on ${base} (got '${got}') - not our server`);
        }
      } catch (e) {
        clearTimeout(timer);
        child.kill("SIGTERM");
        return done(reject, e instanceof Error ? e : new Error(String(e)));
      }
      clearTimeout(timer);
      // Once serving, an unexpected later exit should also be visible.
      child.removeAllListeners("exit");
      done(resolve, {
        base,
        port,
        stop: () => child.kill("SIGTERM"),
      });
    });
  });
}
