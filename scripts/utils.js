const fs = require('fs')

/**
 * 获取满足条件的package文件夹内的包名
 * 必须目录存在
 * 不能是没有buildOptions字段的私有包
 */
const targets = (exports.targets = fs.readdirSync('packages').filter(f => {
  if (!fs.statSync(`packages/${f}`).isDirectory()) {
    // 很稳，判断目录是否存在
    return false
  }
  const pkg = require(`../packages/${f}/package.json`)
  if (pkg.private && !pkg.buildOptions) {
    // 如果是私有包并且没有buildOptions（怀疑是自定义字段）
    return false
  }
  return true
}))

/**
 * 模糊匹配package
 * @param partialTargets 一个正则数组，为满足要求的包名列表
 * @param includeAllMatching 是否将所有包名都返回
 * @returns [] 返回符合要求的包名
 */
exports.fuzzyMatchTarget = (partialTargets, includeAllMatching) => {
  const matched = []
  partialTargets.some(partialTarget => {
    for (const target of targets) {
      // 如果目标包名满足正则要求，就放到matched数组中
      if (target.match(partialTarget)) {
        matched.push(target)
        // 如果第二个参数为true，就到下一回合，意思是让所有包都进matched
        if (!includeAllMatching) {
          break
        }
      }
    }
  })
  // 如果有包命中就返回
  // 否则报错
  if (matched.length) {
    return matched
  } else {
    throw new Error(`Target ${partialTargets} not found!`)
  }
}
