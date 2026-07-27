/** @type {import('stylelint').Config} */
module.exports = {
  customSyntax: 'postcss-scss',
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-scss'],
  rules: {
    /* =========================
       NAMING RULES
    ========================= */
    'selector-class-pattern':
      '^[a-z]([-]?[a-z0-9]+)*(__[a-z0-9]([-]?[a-z0-9]+)*)?(--[a-z0-9]([-]?[a-z0-9]+)*)*$',
    'keyframes-name-pattern': '^([a-z][a-z0-9]*)(-[a-z0-9]+)*$',

    /* =========================
       BEST PRACTICES
    ========================= */
    'block-no-empty': true,
    'color-no-invalid-hex': true,
    'declaration-block-no-duplicate-properties': true,
    'declaration-block-single-line-max-declarations': null,

    /* =========================
       FLEXIBILITY FOR ANGULAR
    ========================= */
  'selector-pseudo-class-no-unknown': true,
'selector-pseudo-element-no-unknown': [
  true,
  {
    ignorePseudoElements: ['ng-deep'],
  },
],
    'no-invalid-double-slash-comments': null,
    'at-rule-no-unknown': null,
    'scss/at-rule-no-unknown': true,

    /* =========================
       DISABLE ANNOYING RULES
    ========================= */
    'no-descending-specificity': null,
  },

  /* =========================
     PERFORMANCE
  ========================= */
  ignoreFiles: [
    '**/*.js',
    '**/*.ts',
    '**/node_modules/**',
    '**/dist/**',
    'src/assets/scss/**',
  ],
}
