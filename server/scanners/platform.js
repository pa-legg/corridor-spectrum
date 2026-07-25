import { readFileSync } from 'node:fs';

export function isPiLike() {
  try {
    const cpuinfo = readFileSync('/proc/cpuinfo', 'utf8');
    return /Raspberry Pi|BCM2/i.test(cpuinfo);
  } catch {
    return process.arch === 'arm64' || process.arch === 'arm';
  }
}
