'use strict';

hexo.extend.generator.register('empty-home', function(locals) {
  if (locals.posts && locals.posts.length) return [];
  return {
    path: 'index.html',
    layout: ['index', 'archive'],
    data: {
      __index: true,
      current: 1,
      current_url: '',
      total: 1,
      posts: locals.posts
    }
  };
});
