import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binary = path.join(root, '.runtime', 'pocketbase');
const version = '0.28.4';

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed. ${result.error || ''}`);
}

if (!existsSync(binary)) {
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('This local starter supports Mac and Linux.');
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'amd64' : null;
  if (!arch) throw new Error('Unsupported CPU architecture.');
  mkdirSync(path.dirname(binary), { recursive: true });
  const zip = path.join(root, '.runtime', 'pocketbase.zip');
  console.log(`Downloading PocketBase ${version}...`);
  run('curl', ['-fL', '--retry', '2', '--max-time', '120', '-o', zip,
    `https://github.com/pocketbase/pocketbase/releases/download/v${version}/pocketbase_${version}_${process.platform}_${arch}.zip`]);
  run('unzip', ['-o', zip, 'pocketbase', '-d', path.dirname(binary)]);
  run('chmod', ['+x', binary]);
}

if (!existsSync(path.join(root, 'frontend', '.env.local'))) {
  copyFileSync(path.join(root, 'frontend', '.env.example'), path.join(root, 'frontend', '.env.local'));
}
if (!existsSync(path.join(root, 'frontend', 'node_modules'))) {
  run('npm', ['install'], path.join(root, 'frontend'));
}
mkdirSync(path.join(root, 'pb_data'), { recursive: true });

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300);
}

const env = { ...process.env, TZ: 'America/New_York', DAYCARE_SEED_DEMO: process.env.DAYCARE_SEED_DEMO || 'true' };
for (const [command, args, cwd] of [
  [binary, ['serve', '--http=127.0.0.1:8090', `--dir=${path.join(root, 'pb_data')}`, `--hooksDir=${path.join(root, 'pb_hooks')}`, `--migrationsDir=${path.join(root, 'pb_migrations')}`], root],
  ['npm', ['run', 'dev'], path.join(root, 'frontend')],
]) {
  const child = spawn(command, args, { cwd, stdio: 'inherit', env });
  children.push(child);
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code || 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log('\nOpen http://127.0.0.1:5173 — Ctrl+C stops both servers.\n');
