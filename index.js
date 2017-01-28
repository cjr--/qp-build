define(module, function(exports, require, make) {

  var path = require('path');
  var glob = require('glob');
  var mustache = require('mustache');
  var uglify = require('uglify-js');
  var qp = require('qp-utility');
  var fss = require('qp-library/fss');
  var fso = require('qp-library/fso');
  var log = require('qp-library/log');
  var ver = require('qp-library/version');
  var asset = require('qp-asset');
  var view = require('qp-view');

  make({

    ns: 'qp-build/build',

    debug: false,
    bump: 'patch',
    version: {},
    state: {},
    pages: [],
    working_directory: '',
    site_dirname: 'site',
    page_dirname: 'page',
    template_directory: '',
    source_directory: '',
    target_directory: '',

    site_links: {},

    init: function(options) {

    },

    build: function() {
      this.build_target_directory();
      this.build_site_assets();
      this.build_pages();
    },

    build_target_directory: function() {
      fss.delete_directory(this.target_directory, { children: true });
    },

    build_site_assets: function() {
      var site_assets = this.get_assets(path.join(this.site_dirname, '.asset'));
      var site_links = qp.map(qp.union(
        this.merge_files(site_assets.files.merge, 'site'),
        this.copy_files(site_assets.files.copy)
      ), file => '/' + qp.ltrim(file, '/site/'));
      this.site_links = this.group_by_extension(site_links);
    },

    build_pages: function() {
      qp.each(this.pages, this.build_page);
    },

    build_page: function(page) {
      var page_assets = this.get_assets(path.join(this.page_dirname, page, '.asset'));
      var page_view = this.get_view(path.join(this.page_dirname, page, page + '.html'));
      page_assets.add_files('merge', page_view.file_list);

      var library_links = this.group_by_extension(this.copy_files(page_assets.files.library));

      var page_links = this.group_by_extension(
        qp.union(
          this.copy_files(page_assets.files.copy),
          this.merge_files(page_assets.files.merge, path.join(page, page))
        )
      );

      var page_html = this.apply_template(page_view.token.template, {
        title: page_view.token.title,
        color: page_view.token.color,
        display: 'standalone',
        appcache: '',
        css_files: qp.union(library_links.css, this.site_links.css, page_links.css),
        js_files: qp.union(library_links.js, this.site_links.js, page_links.js),
        content: page_view.html
      });
      fss.write(path.join(this.target_directory, page, 'index.html'), page_html);

      log(page_html)
    },

    get_assets: function(file) {
      return asset.create({
        state: this.state,
        root: this.working_directory,
        file: path.join(this.source_directory, file)
      });
    },

    get_view: function(file) {
      return view.create({
        root: this.source_directory,
        file: path.join(this.source_directory, file)
      });
    },

    merge_files: function(file_list, filename) {
      var merged_files = [];
      qp.each_own(this.group_by_extension(file_list), (files, ext) => {
        var merge_file = path.join(this.target_directory, filename + '.' + ext);
        fss.merge_files(files, { out: merge_file });
        merged_files.push(fso.filename(merge_file));
      });
      return merged_files;
    },

    copy_files: function(source_files) {
      return qp.map(source_files, file => {
        var target_file = qp.after(file, this.source_directory);
        fss.copy(file, path.join(this.target_directory, target_file));
        return target_file;
      });
    },

    group_by_extension: function(files) {
      return files.reduce((group, file) => {
        var ext = fso.extension(file);
        (group[ext] = group[ext] || []).push(file);
        return group;
      }, {});
    },

    apply_template: function(template, data) {
      return mustache.render(fss.read(this.template_directory, template), data);
    }

  });

});
