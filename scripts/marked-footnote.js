'use strict';

const markedFootnote = require('marked-footnote');

hexo.extend.filter.register('marked:use', function(markedUse) {
  markedUse(markedFootnote({
    description: '脚注',
    backRefLabel: '返回引用 {0}'
  }));
});
