import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, basename, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const projectName = basename(projectRoot)
const projectParent = dirname(projectRoot)
const outputArgument = process.argv.slice(2).filter(argument => argument !== '--')[0]
const output = resolve(outputArgument ?? resolve(projectParent, 'vectorun-source.zip'))

if (output.startsWith(`${projectRoot}${sep}`)) {
  console.error('Choose an output path outside the project folder so the archive cannot include itself.')
  process.exit(1)
}

const requiredFiles = [
  'package.json',
  'pnpm-lock.yaml',
  'README.md',
  'assets.lock.json',
  'assets/models/vector_car.glb',
  'assets/share/favicon.png',
]
const missing = requiredFiles.filter(file => !existsSync(resolve(projectRoot, file)))
if (missing.length) {
  console.error(`Cannot make a self-contained source bundle; missing: ${missing.join(', ')}`)
  process.exit(1)
}

mkdirSync(dirname(output), { recursive: true })
const temporaryOutput = `${output}.tmp-${process.pid}`
if (existsSync(temporaryOutput)) rmSync(temporaryOutput)
const excluded = [
  `${projectName}/.git`, `${projectName}/.git/`, `${projectName}/.git/*`, `${projectName}/**/.git/*`,
  `${projectName}/node_modules`, `${projectName}/node_modules/`, `${projectName}/node_modules/*`, `${projectName}/**/node_modules/*`,
  `${projectName}/dist`, `${projectName}/dist/`, `${projectName}/dist/*`, `${projectName}/**/dist/*`,
  `${projectName}/shots`, `${projectName}/shots/`, `${projectName}/shots/*`, `${projectName}/**/shots/*`,
  `${projectName}/coverage`, `${projectName}/coverage/`, `${projectName}/coverage/*`, `${projectName}/**/coverage/*`,
  `${projectName}/.vite`, `${projectName}/.vite/`, `${projectName}/.vite/*`, `${projectName}/**/.vite/*`,
  `${projectName}/playwright-report/*`, `${projectName}/**/playwright-report/*`,
  `${projectName}/test-results/*`, `${projectName}/**/test-results/*`,
  `${projectName}/.env`, `${projectName}/.env.*`, `${projectName}/**/.env`, `${projectName}/**/.env.*`,
  `${projectName}/*.log`, `${projectName}/**/*.log`,
  `${projectName}/*.zip`, `${projectName}/**/*.zip`,
  `${projectName}/**/*.tsbuildinfo`, `${projectName}/.DS_Store`, `${projectName}/**/.DS_Store`,
]
const result = spawnSync('zip', ['-r', '-X', '-q', temporaryOutput, projectName, '-x', ...excluded], {
  cwd: projectParent,
  stdio: 'inherit',
})
if (result.error) {
  if (existsSync(temporaryOutput)) rmSync(temporaryOutput)
  console.error(`Could not run zip: ${result.error.message}`)
  process.exit(1)
}
if (result.status !== 0) {
  if (existsSync(temporaryOutput)) rmSync(temporaryOutput)
  process.exit(result.status ?? 1)
}
renameSync(temporaryOutput, output)
console.log(`Source archive ready: ${output}`)
