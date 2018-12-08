require('./boot');

define(module, function(exports, require) {

  var path = require('path');
  var glob = require('glob');
  var mustache = require('mustache');
  var qp = require('qp-utility');
  var fss = require('qp-library/fss');
  var fso = require('qp-library/fso');
  var log = require('qp-library/log');
  var asset = require('qp-asset');
  var version = require('qp-library/version');
  var vue = require('qp-vue');

  var min = {
    js: require('uglify-es'),
    css: require('csso')
  };

  qp.make(exports, {

    ns: 'qp-build/build',

    debug: false,
    development: false,
    production: false,
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
    locations: null,

    site_links: {},

    build: function() {
      this.production = !this.development;
      this.build_target_directory();
      this.build_site_assets();
      this.build_pages();
      this.version = version(this.bump);

      fss.write_json(this.target_directory, 'info.json', {
        mode: this.development ? 'DEVELOPMENT' : 'PRODUCTION',
        debug: this.debug,
        version: this.version.to
      });
    },

    build_target_directory: function() {
      fss.delete_directory(this.target_directory, { children: true });
    },

    build_site_assets: function() {
      var site_assets = this.build_assets(path.join(this.site_dirname, '.asset'));
      if (this.debug) site_assets.files.merge.unshift(path.join(this.source_directory, 'debug.js'));
      if (this.development) site_assets.files.merge.unshift(path.join(this.source_directory, 'development.js'));
      this.site_links = this.group_by_extension(
        qp.union(
          this.copy_files(site_assets.files.copy, file => qp.ltrim(file, '/site')),
          this.merge_files(site_assets.files.merge, 'site')
        )
      );
      qp.each(site_assets.files.copy_to, file => {
        this.copy_file(file.source, path.join(this.target_directory, file.target));
      });
    },

    build_pages: function() {
      qp.each(this.pages, (page) => {
        page.template = page.template || page.type + '.template.html';
        this['build_' + page.type + '_page'](page);
      });

      // fss.write(
      //   path.join(this.target_directory, 'fav', 'browserconfig.xml'),
      //   this.apply_template('browserconfig.xml', this.state)
      // );
      // fss.write(
      //   path.join(this.target_directory, 'fav', 'manifest.json'),
      //   this.apply_template('manifest.json', this.state)
      // );
    },

    build_html_page: function(page) {
      var page_assets = this.build_assets(path.join(this.page_dirname, page.source, '.asset'));
      if (page_assets.asset_file.exists) {

        var copy_links = this.group_by_extension(
          this.copy_files(this.order_by_location(page_assets.files.copy))
        );

        var merge_links = this.group_by_extension(
          this.merge_files(this.order_by_location(page_assets.files.merge), path.join(page.target, 'index'))
        );

        var page_html = this.apply_template(page.template, qp.assign(qp.clone(page_assets.state), {
          appcache: '',
          css_files: qp.union(page_assets.links.css, copy_links.css, this.site_links.css, merge_links.css),
          js_files: qp.union(page_assets.links.js, copy_links.js, this.site_links.js, merge_links.js),
          page_content: fss.read(path.join(this.source_directory, this.page_dirname, page.source, page.source + '.html'))
        }));

        fss.write(path.join(this.target_directory, page.target, 'index.html'), page_html);

      }
    },

    build_app_page: function(page) {
      this.build_vue_page(page);
    },

    build_vue_page: function(page) {
      var page_assets = this.build_assets(path.join(this.page_dirname, page.source, '.asset'));
      if (page_assets.asset_file.exists) {

        var view_assets = { files: { copy: [], merge: [] } };
        qp.each(qp.find_all(page_assets.assets, { view: true }), (view) => {
          var vue_assets = vue.component(view.target, view.target === page_assets.asset_dir);
          qp.push(view_assets.files.copy, vue_assets.files.copy);
          qp.push(view_assets.files.merge, vue_assets.files.merge);
        });

        var copy_links = this.group_by_extension(
          this.copy_files(this.order_by_location(qp.union(view_assets.files.copy, page_assets.files.copy)))
        );

        var merge_links = this.group_by_extension(
          this.merge_files(this.order_by_location(qp.union(view_assets.files.merge, page_assets.files.merge)), path.join(page.target, 'index'))
        );

        var page_html = this.apply_template(page.template, qp.assign(qp.clone(page_assets.state), {
          appcache: '',
          css_files: qp.union(page_assets.links.css, copy_links.css, this.site_links.css, merge_links.css),
          js_files: qp.union(page_assets.links.js, copy_links.js, this.site_links.js, merge_links.js)
        }));

        fss.write(path.join(this.target_directory, page.target, 'index.html'), page_html);

      }
    },

    build_assets: function(file) {
      return asset.create({
        state: qp.clone(this.state),
        root: this.working_directory,
        file: path.join(this.source_directory, file)
      });
    },

    merge_files: function(file_list, filename) {
      var merged_files = [];
      qp.each_own(this.group_by_extension(file_list), (files, ext) => {
        var merge_file = this.make_root_link(filename + '.' + ext);
        var merge_filename = path.join(this.target_directory, merge_file);
        fss.merge_files(files, { out_file: merge_filename });
        if (this.production) {
          var merge_min_file = this.make_root_link(filename + '.min.' + ext);
          var merge_min_filename = path.join(this.target_directory, merge_min_file);
          if (ext === 'js') {
            var result = min.js.minify(fss.read(merge_filename), { compress: { dead_code: false, unused: false } });
            if (result.error) debug(result.error);
            fss.write(merge_min_filename, result.error || result.code);
          } else if (ext === 'css') {
            var result = min.css.minify(fss.read(merge_filename), { });
            fss.write(merge_min_filename, result.css);
          }
          merged_files.push(this.make_root_link(merge_min_file));
        } else {
          merged_files.push(this.make_root_link(merge_file));
        }
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

    order_by_location: function(files) {
      var locations = this.locations(this.source_directory, this.working_directory);
      qp.each(files, (file) => {
        qp.each(locations, (location) => {
          if (qp.starts(file, location.path)) {
            location.files.push(file);
            return false;
          }
        });
      });
      return qp.reduce(locations, (files, location) => qp.union(files, location.files), []);
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
