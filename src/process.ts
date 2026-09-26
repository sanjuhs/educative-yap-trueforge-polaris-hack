import { spawn, type ChildProcess } from "node:child_process";
const active = new Set<ChildProcess>();
function terminate(child: ChildProcess) {
  try {
    if (process.platform !== "win32" && child.pid)
      process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch {
    /* The process may already have exited. */
  }
}
export function stopMediaProcesses() {
  for (const child of active) terminate(child);
}
export function run(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    timeout?: number;
    env?: NodeJS.ProcessEnv;
    onOutput?: (s: string) => void;
  } = {},
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    active.add(child);
    let output = "";
    const capture = (data: Buffer) => {
      const text = data.toString();
      output = (output + text).slice(-16000);
      options.onOutput?.(text);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    const timer = setTimeout(() => {
      terminate(child);
      reject(new Error(`${command} timed out`));
    }, options.timeout || 600_000);
    child.once("error", (err) => {
      clearTimeout(timer);
      active.delete(child);
      reject(err);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      active.delete(child);
      code === 0
        ? resolve(output)
        : reject(
            new Error(`${command} exited ${code}: ${output.slice(-1800)}`),
          );
    });
  });
}
export async function probe(file: string) {
  return JSON.parse(
    await run("ffprobe", [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      file,
    ]),
  );
}

export function rendererEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, YAP_RENDER_WORKER: "1" };
  for (const key of Object.keys(env))
    if (/KEY|TOKEN|SECRET|PASSWORD/.test(key)) delete env[key];
  return env;
}
