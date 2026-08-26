const path = require('node:path')

module.exports = (config) => {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      clearContext: false,
      jasmine: { random: false },
    },
    reporters: ['progress', 'kjhtml'],
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-software-rasterizer',
        ],
      },
    },
    coverageReporter: {
      dir: path.join(__dirname, 'coverage', 'owned'),
      subdir: '.',
      reporters: [
        { type: 'text-summary' },
        { type: 'lcovonly' },
        { type: 'html' },
      ],
    },
    restartOnFileChange: true,
  })
}
