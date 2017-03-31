let events = require('events')
let path = require('path')
let fs = require('fs')
let mkdirp = require('mkdirp')
let util = require('util')

/**
 * Initialize a new Doc test reporter.
 *
 * @param {Runner} runner
 * @api public
 */
class DocReporter extends events.EventEmitter {
  constructor (baseReporter, config, options = {}) {
    super()

    this.baseReporter = baseReporter
    this.config = config
    this.options = options

    const {epilogue} = this.baseReporter

    this.on('end', () => {
      for (let cid of Object.keys(this.baseReporter.stats.runners)) {
        const runnerInfo = this.baseReporter.stats.runners[cid]
        const start = this.baseReporter.stats.start
        const end = this.baseReporter.stats.end

        let json = this.prepareJson(start, end, runnerInfo)
        this.writeJson(json)

        let md = this.prepareMd(runnerInfo)
        this.writeMd(md, json.file.replace('/build/', '/publish/output/').replace('.feature', '.md'))
      }
      epilogue.call(baseReporter)
    })
  }

  prepareJson (start, end, runnerInfo) {
    let resultSet = {}
    let skippedCount = 0
    let passedCount = 0
    let failedCount = 0

    resultSet.start = start
    resultSet.end = end
    resultSet.capabilities = runnerInfo.capabilities
    resultSet.host = runnerInfo.config.host
    resultSet.port = runnerInfo.config.port
    resultSet.baseUrl = runnerInfo.config.baseUrl
    resultSet.waitForTimeout = runnerInfo.config.waitForTimeout
    resultSet.framework = runnerInfo.config.framework
    resultSet.mochaOpts = runnerInfo.config.mochaOpts
    resultSet.suites = []

    for (let specId of Object.keys(runnerInfo.specs)) {
      const spec = runnerInfo.specs[specId]
      resultSet.file = spec.files[0]
      resultSet.keys = Object.keys(spec)

      for (let suiteName of Object.keys(spec.suites)) {
        const suite = spec.suites[suiteName]
        const testSuite = {}

        testSuite.name = suite.title
        testSuite.description = Object.keys(suite)
        testSuite.duration = suite._duration
        testSuite.start = suite.start
        testSuite.end = suite.end
        testSuite.tests = []
        testSuite.hooks = []

        for (let hookName of Object.keys(suite.hooks)) {
          const hook = suite.hooks[hookName]
          const hookResult = {}

          hookResult.start = hook.start
          hookResult.end = hook.end
          hookResult.duration = hook.duration
          hookResult.title = hook.title
          hookResult.associatedSuite = hook.parent
          hookResult.associatedTest = hook.currentTest
          testSuite.hooks.push(hookResult)
        }

        for (let testName of Object.keys(suite.tests)) {
          const test = suite.tests[testName]
          const testCase = {}
          let screenShot = testName.split('"')[1]

          if (testName.startsWith('Screenshot')) {
            let index = path.dirname(resultSet.file).indexOf('/build/')
            let folder = path.dirname(resultSet.file).slice(index + 7)

            testCase.name = '../output/' + folder + '/' + screenShot + '.png'
          } else {
            testCase.name = test.title
          }

          testCase.start = test.start
          testCase.end = test.end
          testCase.duration = test.duration

          if (test.state === 'pending') {
            skippedCount = skippedCount + 1
            testCase.state = 'skipped'
          } else if (test.state === 'pass') {
            passedCount = passedCount + 1
            testCase.state = test.state
          } else if (test.state === 'fail') {
            failedCount = failedCount + 1
            testCase.state = test.state
          } else {
            testCase.state = test.state
          }

          if (test.error) {
            if (test.error.type) {
              testCase.errorType = test.error.type
            }
            if (test.error.message) {
              testCase.error = test.error.message
            }
            if (test.error.stack) {
              testCase.standardError = test.error.stack
            }
          }

          if (!testName.startsWith('NoDoc')) {
            testSuite.tests.push(testCase)
          }
        }

        resultSet.state = {}
        resultSet.state.passed = passedCount
        resultSet.state.failed = failedCount
        resultSet.state.skipped = skippedCount
        resultSet.suites.push(testSuite)
      }
    }
    return resultSet
  }

  prepareMd (runnerInfo) {
    let md = ''

    for (let specId of Object.keys(runnerInfo.specs)) {
      let spec = runnerInfo.specs[specId]

      for (let suiteName of Object.keys(spec.suites)) {
        let suite = spec.suites[suiteName]

        md += '## ' + suite.title + '\n'
        let step = 0

        for (let testName of Object.keys(suite.tests)) {
          let test = suite.tests[testName]
          let screenShot = testName.split('"')[1]

          if (testName.startsWith('Screenshot')) {
            md += '![' + screenShot + '](' + screenShot + '.png)\n'
          } else if (testName.startsWith('NoDoc')) {
            // skip
          } else {
            step++
            md += step + '. ' + test.title + '\n'
          }
        }
      }
    }

    return md
  }

  writeJson (json) {
    if (!this.options || typeof this.options.outputDir !== 'string') {
      return console.log(`Cannot write json report: empty or invalid 'outputDir'.`)
    }

    try {
      const filename = json.file.replace('/build/', '/publish/output/').replace('.feature', '.json')
      const filepath = path.dirname(filename)

      mkdirp.sync(filepath)
      fs.writeFileSync(filename, JSON.stringify(json))

      mkdirp('./screenShots')
      let screenShots = fs.readdirSync('./screenShots/')
      screenShots.forEach(screenShot => {
        fs.renameSync('./screenShots/' + screenShot, filepath + '/' + screenShot)
      })

    } catch (e) {
      console.log(`Failed to write json report to [${this.options.outputDir}]. Error: ${e}`)
    }
  }

  writeMd (md, filename) {
    if (!this.options || typeof this.options.outputDir !== 'string') {
      return console.log(`Cannot write md report: empty or invalid 'outputDir'.`)
    }

    try {
      const filepath = path.dirname(filename)

      mkdirp.sync(filepath)
      fs.writeFileSync(filename, md)

      mkdirp('./screenShots')
      let screenShots = fs.readdirSync('./screenShots/')
      screenShots.forEach(screenShot => {
        fs.renameSync('./screenShots/' + screenShot, filepath + '/' + screenShot)
      })

    } catch (e) {
      console.log(`Failed to write md report to [${this.options.outputDir}]. Error: ${e}`)
    }
  }
}

DocReporter.reporterName = 'DocReporter'

util.inherits(DocReporter, events.EventEmitter)

exports = module.exports = DocReporter
