define(module, function(exports, require, make) {

  var path = require('path');
  var qp = require('qp-utility');
  var fso = require('qp-library/fso');
  var fss = require('qp-library/fss');
  var vue_compiler = require('vue-template-compiler');
  var es6_transpile = require('vue-template-es2015-compiler');

  exports({

    component: function(filepath) {
      var name = path.basename(filepath);

      var css_file = path.join(filepath, name + '.css');
      var js_file = path.join(filepath, name + '.js');
      var html_file = path.join(filepath, name + '.html');
      var tpl_file = path.join(filepath, name + '.template.js');

      var view = {
        files: { copy: [], merge: [ css_file, tpl_file, js_file ] }
      };

      var template = vue_compiler.compile(fss.read(html_file));
      var compiled = qp.build(
        'module.exports(\'', name, '\',{',
          'render:function(){', template.render, '},',
          'staticRenderFns:[', qp.map(template.staticRenderFns, (fn) => 'function(){' + fn + '}').join(), ']',
        '});'
      );
      fss.write(tpl_file, es6_transpile(compiled));

      return view;
    }

  });

});
