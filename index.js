require('./boot');

define(module, function(exports, require, make) {

  var path = require('path');
  var glob = require('glob');
  var mustache = require('mustache');
  var uglify = require('uglify-js');
  var qp = require('qp-utility');
  var fss = require('qp-library/fss');
  var fso = require('qp-library/fso');
  var log = require('qp-library/log');
  var asset = require('qp-asset');
  var view = require('qp-view');
  var version = require('qp-library/version');

  make({

    ns: 'qp-build/build',

    debug: false,
    bump: 'bump',
    version: '',
    state: {},
    pages: [],
    working_directory: '',
    site_dirname: 'site',
    page_dirname: 'page',
    template_directory: '',
    source_directory: '',
    target_directory: '',

    site_links: {},

    build: function() {
      this.build_target_directory();
      this.build_site_assets();
      this.build_pages();
      this.version = version(this.bump);
    },

    build_target_directory: function() {
      fss.delete_directory(this.target_directory, { children: true });
    },

    build_site_assets: function() {
      var site_assets = this.build_assets(path.join(this.site_dirname, '.asset'));
      var site_links = qp.union(
        this.copy_files(site_assets.files.copy, file => qp.ltrim(file, '/site/')),
        this.merge_files(site_assets.files.merge, 'site')
      );
      this.site_links = this.group_by_extension(site_links);
    },

    build_pages: function() {
      qp.each(this.pages, this.build_page);
    },

    build_page: function(page) {
      var page_dir = page === 'index' ? '' : page;
      var page_assets = this.build_assets(path.join(this.page_dirname, page, '.asset'));
      if (page_assets.asset_file.exists) {
        var page_view = this.build_view(path.join(this.page_dirname, page, page + '.html'));
        page_assets.add_files({ type: 'merge', files: page_view.file_list, prepend: true });
        var library_links = this.group_by_extension(this.copy_files(page_assets.files.library));
        var page_links = this.group_by_extension(
          qp.union(
            this.copy_files(page_assets.files.copy),
            this.merge_files(page_assets.files.merge, path.join(page, 'index'))
          )
        );
        var page_state = {
          page_title: page_view.token.title || page_assets.state.app_fullname,
          app_fullname: page_assets.state.app_fullname,
          app_name: page_assets.state.app_name,
          brand_color: page_assets.state.brand_color,
          app_display: page_assets.state.app_display
        };
        var page_html = this.apply_template(page_assets.state.page_template, qp.assign(page_state, {
          appcache: '',
          css_files: qp.union(library_links.css, this.site_links.css, page_links.css),
          js_files: qp.union(library_links.js, this.site_links.js, page_links.js),
          content: page_view.html
        }));
        fss.write(path.join(this.target_directory, page_dir, 'index.html'), page_html);
        fss.write(
          path.join(this.target_directory, 'fav', 'browserconfig.xml'),
          this.apply_template('browserconfig.xml', page_state)
        );
        fss.write(
          path.join(this.target_directory, 'fav', 'manifest.json'),
          this.apply_template('manifest.json', page_state)
        );
      }
    },

    build_assets: function(file) {
      return asset.create({
        state: qp.clone(this.state),
        root: this.working_directory,
        file: path.join(this.source_directory, file)
      });
    },

    build_view: function(file) {
      return view.create({
        root: this.source_directory,
        file: path.join(this.source_directory, file)
      });
    },

    merge_files: function(file_list, filename) {
      var merged_files = [];
      qp.each_own(this.group_by_extension(file_list), (files, ext) => {
        var merge_file = this.make_root_link(filename + '.' + ext);
        var merge_filename = path.join(this.target_directory, merge_file);
        fss.merge_files(files, { out_file: merge_filename });
        merged_files.push(this.make_root_link(merge_file));
      });
      return merged_files;
    },

    copy_files: function(source_files, target) {
      return qp.map(source_files, source_file => {
        var target_file = this.make_root_link(qp.after(source_file, this.source_directory));
        if (target) target_file = target.call(this, target_file);
        this.copy_file(source_file, path.join(this.target_directory, target_file));
        return target_file;
      });
    },

    copy_file: function(source, target) {
      if (!fss.exists(target)) {
        fss.copy(source, target);
      }
    },

    make_root_link: function(link) {
      return '/' + qp.ltrim(qp.ltrim(link, '/'), 'index/');
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
