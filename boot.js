var path = require('path');
require('dotenv').load({ silent: true });
require(path.join(process.env.REPO_PATH || '', 'qp-define'));

// use local source code if its available
if (process.env.REPO_PATH) {
  define.path('repo', process.env.REPO_PATH);
  define.path('qp-utility', 'repo/qp-utility');
  define.path('qp-library', 'repo/qp-library');
  define.path('qp-asset', 'repo/qp-asset');
  define.path('qp-view', 'repo/qp-view');
}
