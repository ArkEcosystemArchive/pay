const path = require('path')
const merge = require('webpack-merge')
const pkg = require('../package.json')
const base = require('./webpack.base')

const resolve = (dir) => path.resolve(__dirname, '..', dir)

const format = (dist) => ({
  path: resolve(path.dirname(dist)),
  filename: path.basename(dist)
})

const browserConfig = {
  entry: resolve(pkg.main),
  target: 'web',
  babel: {
    modules: 'umd',
    useBuiltIns: 'usage',
    targets: {
      browsers: 'defaults'
    }
  },
  output: {
    ...format(pkg.browser),
    library: 'ArkPay',
    libraryTarget: 'umd',
    umdNamedDefine: true
  }
}

const moduleConfig = {
  target: 'node',
  babel: {
    modules: 'commonjs',
    targets: {
      node: 'current'
    }
  },
  entry: resolve(pkg.main),
  output: {
    ...format(pkg.module),
    libraryTarget: 'commonjs2'
  },
  optimization: {
    minimize: false
  }
}

module.exports = [browserConfig, moduleConfig].map(({ babel, ...entry }) => merge(base(babel), entry));
