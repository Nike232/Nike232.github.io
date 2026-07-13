'use strict';

const markedKatex = require('marked-katex-extension');

const options = {
  nonStandard: true,
  output: 'htmlAndMathml',
  strict: 'warn',
  throwOnError: false,
  trust: false
};

hexo.extend.filter.register('marked:use', function(markedUse) {
  markedUse(markedKatex(options));
});
