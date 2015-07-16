exports.input = __dirname;

var path = require( 'path' );
exports.output = path.resolve( __dirname, 'output' );

// var moduleEntries = 'html,htm,phtml,tpl,vm,js';
// var pageEntries = 'html,htm,phtml,tpl,vm';

exports.getProcessors = function () {
    var Versioning = require('edp-build-versioning');
    var edpBuildHelper = Versioning.helper;
    var lessProcessor = new LessCompiler({
        files: ['src/common/css/main.less']
    });
    var cssProcessor = new CssCompressor();
    var moduleProcessor = new ModuleCompiler({
        getCombineConfig: function () {
            var entryModuleIds = edpBuildHelper.extractPageEntryModules();

            console.log('combine module number: ' + entryModuleIds.length);

            var combineConf = {};
            entryModuleIds.forEach(function (id) {
                console.log(id);
                combineConf[id] = 1;
            });
            combineConf['biz/bizMain'] = 1;

            return combineConf;
        }
    });
    var jsProcessor = new JsCompressor();
    var pathMapperProcessor = new PathMapper();
    var addCopyright = new AddCopyright();
    var versionProcessor = new Versioning({
        rename: true,
        filePaths: [
            'src/common/a.js'
        ],
        cssURL: true,
        autoScanCss: true,
        require: {
            combine: ['test', 'main', 'common/util', 'common/data', 'biz/bizMain'],
            outputByPage: true,
            output: '\'esl_resource_version\'',
            defaultOutput: 'default_resource_version'
        }

    });

    return {
        'default': [ lessProcessor, moduleProcessor, versionProcessor, pathMapperProcessor ],
        'release': [
            lessProcessor, cssProcessor, moduleProcessor,
            jsProcessor, pathMapperProcessor, addCopyright
        ]
    };
};

exports.exclude = [
    'tool',
    'doc',
    'test',
    'module.conf',
    'dep/packages.manifest',
    'dep/*/*/test',
    'dep/*/*/doc',
    'dep/*/*/demo',
    'dep/*/*/tool',
    'dep/*/*/*.md',
    'dep/*/*/package.json',
    'edp-*',
    '.edpproj',
    '.svn',
    '.git',
    '.gitignore',
    '.idea',
    '.project',
    'Desktop.ini',
    'Thumbs.db',
    '.DS_Store',
    '*.tmp',
    '*.bak',
    '*.swp'
];

exports.injectProcessor = function ( processors ) {
    for ( var key in processors ) {
        global[ key ] = processors[ key ];
    }
};

