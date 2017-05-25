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

  qp.make(exports, {

    ns: 'qp-build/build',

    development: false,
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
      if (this.development) site_assets.files.merge.unshift(path.join(this.source_directory, 'developer.js'));
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

        var vue_assets = vue.component(page_assets.asset_dir);
        var view_assets = { files: { copy: vue_assets.files.copy, merge: vue_assets.files.merge } };
        qp.each(qp.find_all(page_assets.assets, { view: true }), (view) => {
          vue_assets = vue.component(view.target);
          qp.push(view_assets.files.copy, vue_assets.files.copy);
          qp.push(view_assets.files.merge, vue_assets.files.merge);
        });

        var copy_links = this.group_by_extension(
          this.copy_files(this.order_by_location(qp.union(page_assets.files.copy, view_assets.files.copy)))
        );

        var merge_links = this.group_by_extension(
          this.merge_files(this.order_by_location(
            qp.union(page_assets.files.merge, view_assets.files.merge)
          ), path.join(page, 'index'))
        );

        var page_state = {
          page_title: page_assets.state.app_title,
          app_fullname: page_assets.state.app_fullname,
          app_name: page_assets.state.app_name,
          brand_color: page_assets.state.brand_color,
          app_display: page_assets.state.app_display
        };

        var page_html = this.apply_template(page_assets.state.page_template, qp.assign(page_state, {
          appcache: '',
          css_files: qp.union(copy_links.css, this.site_links.css, merge_links.css),
          js_files: qp.union(copy_links.js, this.site_links.js, merge_links.js)
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

    get_locations: function() {
      var src = this.source_directory;
      var cwd = this.working_directory;
      return [
        { key: 'library', path: path.join(src, 'library', path.sep), files: [] },
        { key: 'shared_modules', path: path.join(cwd, 'modules', path.sep), files: [] },
        { key: 'app', path: path.join(src, 'app', path.sep), files: [] },
        { key: 'site', path: path.join(src, 'site', path.sep), files: [] },
        { key: 'local_modules', path: path.join(src, 'modules', path.sep), files: [] },
        { key: 'component', path: path.join(src, 'component', path.sep), files: [] },
        { key: 'components', path: path.join(src, 'components', path.sep), files: [] },
        { key: 'view', path: path.join(src, 'view', path.sep), files: [] },
        { key: 'page', path: path.join(src, 'page', path.sep), files: [] }
      ];
    },

    order_by_location: function(files) {
      var locations = this.get_locations();
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
