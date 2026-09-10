import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';

import { parse as parseDotenv } from 'dotenv';

const root = process.cwd();
const distDirectory = resolve(root, 'dist');
const sensitiveName = /(SECRET|TOKEN|KEY|PASSWORD|PRIVATE|SERVICE_ROLE|DATABASE_URL|DSN)/i;

function localEnvironmentFiles() {
  return readdirSync(root)
    .filter(
      (name) =>
        name === '.env' ||
        (name.startsWith('.env.') && name !== '.env.example') ||
        name === '.dev.vars' ||
        name.startsWith('.dev.vars.')
    )
    .map((name) => resolve(root, name));
}

function deployableFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return deployableFiles(path);
    }
    if (name.startsWith('.dev.vars') || name.startsWith('.env')) {
      return [];
    }
    return [path];
  });
}

const environmentFiles = localEnvironmentFiles();
const sensitiveValues = [];
for (const file of environmentFiles) {
  const values = parseDotenv(readFileSync(file));
  for (const [name, value] of Object.entries(values)) {
    if (!name.startsWith('PUBLIC_') && sensitiveName.test(name) && value.length >= 8) {
      sensitiveValues.push({ name, value });
    }
  }
}

const holdingDirectory = mkdtempSync(resolve(root, '.build-secrets-'));
const moved = [];

try {
  for (const file of environmentFiles) {
    const destination = join(holdingDirectory, basename(file));
    renameSync(file, destination);
    moved.push({ source: file, destination });
  }

  execFileSync('npm', ['run', 'build'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit'
  });
} finally {
  for (const { source, destination } of moved.reverse()) {
    if (existsSync(destination)) {
      renameSync(destination, source);
    }
  }
  rmSync(holdingDirectory, { recursive: true, force: true });
}

const files = deployableFiles(distDirectory).map((file) => readFileSync(file));
const embedded = sensitiveValues
  .filter(({ value }) => files.some((contents) => contents.includes(Buffer.from(value))))
  .map(({ name }) => name);

if (embedded.length) {
  throw new Error(
    `Production bundle contains local sensitive values for: ${[...new Set(embedded)].sort().join(', ')}`
  );
}

mkdirSync(distDirectory, { recursive: true });
process.stdout.write('Production bundle secret scan passed.\n');
