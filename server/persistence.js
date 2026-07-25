import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export class Persistence {
  constructor(filePath) {
    this.filePath = filePath;
    mkdirSync(path.dirname(filePath), { recursive: true });
  }

  load(registry) {
    if (!existsSync(this.filePath)) return false;

    try {
      const data = JSON.parse(readFileSync(this.filePath, 'utf8'));
      registry.importState(data);
      console.log(`[persist] Loaded ${registry.devices.size} devices from ${this.filePath}`);
      return true;
    } catch (err) {
      console.warn('[persist] Failed to load state:', err.message);
      return false;
    }
  }

  save(registry) {
    try {
      writeFileSync(this.filePath, JSON.stringify(registry.exportState(), null, 2));
    } catch (err) {
      console.warn('[persist] Failed to save state:', err.message);
    }
  }
}
