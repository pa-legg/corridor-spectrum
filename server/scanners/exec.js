import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';

export const execAsync = promisify(exec);

export async function run(cmd, timeoutMs = 10000) {
  const { stdout } = await execAsync(cmd, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
  return stdout;
}

export async function commandExists(cmd) {
  try {
    await execAsync(`command -v ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

export function spawnLineProcessor(cmd, args, onLine) {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let buffer = '';

  const consume = (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) onLine(line);
    }
  };

  child.stdout.on('data', consume);
  child.stderr.on('data', consume);
  child.on('error', (err) => console.error(`[spawn] ${cmd}:`, err.message));

  return child;
}
