/*
Produces production builds and stitches together d.ts files.

To specify the package to build, simply pass its name and the desired build
formats to output (defaults to `buildOptions.formats` specified in that package,
or "esm,cjs"):

```
# name supports fuzzy match. will build all packages with name containing "dom":
yarn build dom

# specify the format to output
yarn build core --formats cjs
```
*/
// 增强版fs依赖
const fs = require('fs-extra')
const path = require('path')
const chalk = require('chalk')
// js调用外部shell命令
const execa = require('execa')
// 使用gzip同步压缩的api
const { gzipSync } = require('zlib')
// 压缩算法库
const { compress } = require('brotli')

const { targets: allTargets, fuzzyMatchTarget } = require('./utils')

// 命令行参数分析
// 标准用法，取命令行参数
// _值表示命令行参数，其他为命令行选项
const args = require('minimist')(process.argv.slice(2))
// 命令行参数
const targets = args._
// formats | f选项的参数
const formats = args.formats || args.f
// devOnly | d选项的参数
const devOnly = args.devOnly || args.d
// 没有带devOnly参数并且带了prodOnly | p参数
const prodOnly = !devOnly && (args.prodOnly || args.p)
const sourceMap = args.sourcemap || args.s
const isRelease = args.release
const buildTypes = args.t || args.types || isRelease
const buildAllMatching = args.all || args.a
const commit = execa.sync('git', ['rev-parse', 'HEAD']).stdout.slice(0, 7)

run()

async function run() {
  if (!targets.length) {
    // 没有命令行参数
    // 目前只有npm run build
    await buildAll(allTargets)
    checkAllSizes(allTargets)
  } else {
    await buildAll(fuzzyMatchTarget(targets, buildAllMatching))
    checkAllSizes(fuzzyMatchTarget(targets, buildAllMatching))
  }
}

/**
 * 构建所有包
 * @param {string[]} targets - 包名数组
 */
async function buildAll(targets) {
  for (const target of targets) {
    await build(target)
  }
}

/**
 * 构建单个包
 * @param {string} target - 包名
 */
async function build(target) {
  // 拿到包的路径
  const pkgDir = path.resolve(`packages/${target}`)
  // 取配置文件
  const pkg = require(`${pkgDir}/package.json`)

  // only build published packages for release
  if (isRelease && pkg.private) {
    return
  }

  // if building a specific format, do not remove dist.
  if (!formats) {
    await fs.remove(`${pkgDir}/dist`)
  }

  const env =
    (pkg.buildOptions && pkg.buildOptions.env) ||
    (devOnly ? 'development' : 'production')
  await execa(
    'rollup',
    [
      '-c',
      '--environment',
      [
        `COMMIT:${commit}`,
        `NODE_ENV:${env}`,
        `TARGET:${target}`,
        formats ? `FORMATS:${formats}` : ``,
        buildTypes ? `TYPES:true` : ``,
        prodOnly ? `PROD_ONLY:true` : ``,
        sourceMap ? `SOURCE_MAP:true` : ``
      ]
        .filter(Boolean)
        .join(',')
    ],
    { stdio: 'inherit' }
  )

  if (buildTypes && pkg.types) {
    console.log()
    console.log(
      chalk.bold(chalk.yellow(`Rolling up type definitions for ${target}...`))
    )

    // 一个api导出工具
    const { Extractor, ExtractorConfig } = require('@microsoft/api-extractor')

    // 获取extractor配置文件地址
    const extractorConfigPath = path.resolve(pkgDir, `api-extractor.json`)

    const extractorConfig = ExtractorConfig.loadFileAndPrepare(
      extractorConfigPath
    )
    const extractorResult = Extractor.invoke(extractorConfig, {
      localBuild: true,
      showVerboseMessages: true
    })

    if (extractorResult.succeeded) {
      // concat additional d.ts to rolled-up dts
      const typesDir = path.resolve(pkgDir, 'types')
      if (await fs.exists(typesDir)) {
        const dtsPath = path.resolve(pkgDir, pkg.types)
        const existing = await fs.readFile(dtsPath, 'utf-8')
        const typeFiles = await fs.readdir(typesDir)
        const toAdd = await Promise.all(
          typeFiles.map(file => {
            return fs.readFile(path.resolve(typesDir, file), 'utf-8')
          })
        )
        await fs.writeFile(dtsPath, existing + '\n' + toAdd.join('\n'))
      }
      console.log(
        chalk.bold(chalk.green(`API Extractor completed successfully.`))
      )
    } else {
      console.error(
        `API Extractor completed with ${extractorResult.errorCount} errors` +
          ` and ${extractorResult.warningCount} warnings`
      )
      process.exitCode = 1
    }

    await fs.remove(`${pkgDir}/dist/packages`)
  }
}

// 逐个检查所有包大小
function checkAllSizes(targets) {
  if (devOnly) {
    return
  }
  console.log()
  for (const target of targets) {
    checkSize(target)
  }
  console.log()
}

// 判断单个包大小
function checkSize(target) {
  const pkgDir = path.resolve(`packages/${target}`)
  checkFileSize(`${pkgDir}/dist/${target}.global.prod.js`)
}

function checkFileSize(filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }
  const file = fs.readFileSync(filePath)
  const minSize = (file.length / 1024).toFixed(2) + 'kb'
  const gzipped = gzipSync(file)
  const gzippedSize = (gzipped.length / 1024).toFixed(2) + 'kb'
  const compressed = compress(file)
  const compressedSize = (compressed.length / 1024).toFixed(2) + 'kb'
  console.log(
    `${chalk.gray(
      chalk.bold(path.basename(filePath))
    )} min:${minSize} / gzip:${gzippedSize} / brotli:${compressedSize}`
  )
}
