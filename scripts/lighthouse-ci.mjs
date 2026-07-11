import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const HOST = '127.0.0.1';
const getFreePort = () =>
  new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.once('error', rejectPort);
    server.listen(0, HOST, () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });

const PORT = await getFreePort();
const URL = `http://${HOST}:${PORT}/`;
const REPORT_DIR = resolve('lighthouse-reports');
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const run = (command, args, options = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} exited with ${code ?? signal}`));
    });
  });

const waitForServer = async () => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(URL);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Preview server did not become ready at ${URL}`);
};

const runAudit = async (label, extraArgs = []) => {
  const reportPath = resolve(REPORT_DIR, `${label}.json`);
  await run(npx, [
    '--yes',
    'lighthouse@13.4.0',
    URL,
    '--quiet',
    '--output=json',
    `--output-path=${reportPath}`,
    '--only-categories=performance,accessibility,best-practices,seo',
    '--chrome-flags=--headless --no-sandbox',
    ...extraArgs,
  ]);

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const scores = Object.fromEntries(
    CATEGORIES.map((category) => [category, Math.round((report.categories[category]?.score || 0) * 100)]),
  );
  const summary = CATEGORIES.map((category) => `${category}=${scores[category]}`).join(' ');
  console.log(`${label}: ${summary}`);

  const failed = CATEGORIES.filter((category) => scores[category] !== 100);
  if (failed.length) {
    throw new Error(`${label} did not reach 100 in: ${failed.join(', ')}`);
  }
};

await rm(REPORT_DIR, { recursive: true, force: true });
await mkdir(REPORT_DIR, { recursive: true });

const preview = spawn(
  process.execPath,
  [resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', HOST, '--port', String(PORT), '--strictPort'],
  { stdio: 'inherit' },
);

try {
  await waitForServer();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await runAudit(`mobile-${attempt}`);
  }
  await runAudit('desktop', ['--preset=desktop']);
} finally {
  if (preview.exitCode === null) {
    preview.kill('SIGTERM');
    await new Promise((resolveExit) => preview.once('exit', resolveExit));
  }
}
