import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const historicalTest = resolve('src/services/historicalVirtualLessons.test.js');
const vitest = resolve('node_modules/vitest/vitest.mjs');

describe('historical virtual lesson host timezone independence', () => {
  it.each(['Asia/Vladivostok', 'UTC'])('passes the production-like mapping in %s', timezone => {
    const result = spawnSync(process.execPath, [vitest, 'run', historicalTest], {
      cwd: process.cwd(),
      env: { ...process.env, TZ: timezone },
      encoding: 'utf8',
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
