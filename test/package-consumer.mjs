import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const rector = join(root, 'rector')
const typescript = join(rector, 'node_modules/typescript/bin/tsc')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const temp = await mkdtemp(join(tmpdir(), 'rector-toc-consumer-'))
const consumer = join(temp, 'consumer')

async function run(command, args, cwd) {
  try {
    const { stdout } = await exec(command, args, { cwd, timeout: 180_000, maxBuffer: 16_000_000 })
    return stdout.trim()
  } catch (error) {
    throw new Error(
      'Command failed: ' + command + ' ' + args.join(' ') +
      '\nstdout:\n' + (error.stdout ?? '') + '\nstderr:\n' + (error.stderr ?? ''),
      { cause: error },
    )
  }
}
async function pack(directory) {
  const output = await run(npm, ['pack', '--silent', '--pack-destination', temp], directory)
  const name = output.split(/\r?\n/).at(-1)
  if (!name?.endsWith('.tgz')) throw new Error('npm pack did not return a tarball: ' + output)
  return join(temp, name)
}

try {
  const rectorPackage = await pack(rector)
  const tocPackage = await pack(root)
  await mkdir(consumer)
  await writeFile(join(consumer, 'package.json'), JSON.stringify({
    name: 'rector-toc-packed-consumer',
    version: '1.0.0',
    private: true,
    type: 'module',
  }))
  await run(npm, ['install', '--no-audit', '--no-fund', rectorPackage, tocPackage], consumer)
  await copyFile(join(root, 'test/consumer-check.mjs'), join(consumer, 'check.mjs'))
  await copyFile(join(root, 'test/consumer-check.ts'), join(consumer, 'check.ts'))
  console.log(await run(process.execPath, ['check.mjs'], consumer))
  await run(process.execPath, [
    typescript, '--noEmit', '--strict', '--skipLibCheck', 'false',
    '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--target', 'ES2022', 'check.ts',
  ], consumer)
  console.log('packed consumer: public TypeScript declarations valid')
} finally {
  await rm(temp, { recursive: true, force: true })
}
