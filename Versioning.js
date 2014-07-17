/**
 * @file 版本化处理器：自动生成指定路径前缀的版本号信息的映射关键，同时根据指定的css/js文件路径，
 *       生成版本号信息，版本号基于MD5值生成。
 *       NOTICE: 该版本化处理器默认对于项目的 `dep` 目录不会做处理
 *
 * 使用方式：
 * new Versioning(
 *     {
 *         imgFilePaths: ['src/img/sprite.png'] // 当前只处理 css 图片引用版本号添加！
 *         // autoScanImg: true, // 自动为所有引用的 图片 资源添加版本号信息
 *         jsFilePaths: ['src/common/a.js'],
 *         cssFilePaths: ['src/common/css/main.less'],
 *         // autoScanCss: true, // 自动为所有引用的 css 文件添加版本号信息
 *         pathPrefixDepth: 3,
 *         output: 'src/version.js'
 *                | function (pathVersionMap, files) {}
 *                | '"output-path-version-here"'
 *     }
 * )
 *
 * @author wuhuiyao
 */

var util = require('./lib/util');
var inlineMd5Generator = require('./lib/inline-resource-md5');
var requireMd5Generator = require('./lib/require-resource-md5');
var imgVersioning = require('./lib/img-versioning');

/**
 * 更新引用的资源的路径：为引用的资源路径加上版本号信息，或者替换资源文件的版本号信息的占位符
 * NOTICE: 这里只对非dep目录下的模板文件或者html文件的资源引用加上版本号信息其它忽略
 *
 * @param {Versioning} processor 版本号处理器
 * @param {Array.<Object>} files 要处理的文件对象列表
 * @param {Object} versionMap 资源文件的版本号信息
 */
function updateResourceReference(processor, files, versionMap) {

    // 缓存下面要查找替换的正则表达式
    var regexpMap = {};
    for (var key in versionMap) {
        regexpMap[key] = new RegExp(key, 'g');
    }

    var tplFileSuffix = processor.fileSuffix.tpl;

    for (var i = 0, len = files.length; i < len; i++) {
        var fileInfo = files[i];

        if (util.isFileTypeOf(fileInfo.extname, tplFileSuffix)) {
            for (key in versionMap) {
                var value = versionMap[key];

                // 如果是一个object，则认为只是简单变量替换
                if (typeof value === 'object') {
                    value = value.value;
                }
                else {
                    value = key + '?v=' + value;
                }

                fileInfo.data = fileInfo.data.replace(regexpMap[key], value);
            }
        }
    }
}

/**
 * 默认的文件后缀类型定义
 *
 * @type {{tpl: string, js: string, css: string}}
 * @const
 */
var DEFAULT_FILE_SUFFIX = {
    tpl: 'tpl,html',
    js: 'js',
    css: 'css,less',
    img: 'png,jpg,gif'
};

/**
 * 初始化文件后缀信息
 *
 * @inner
 * @param {Versioning} processor 版本化处理器
 */
function initFileSuffixInfo(processor) {
    var fileSuffix = processor.fileSuffix || (processor.fileSuffix = {});
    var suffix;

    for (var k in DEFAULT_FILE_SUFFIX) {
        if (DEFAULT_FILE_SUFFIX.hasOwnProperty(k)) {
            suffix = fileSuffix[k] || DEFAULT_FILE_SUFFIX[k];
            fileSuffix[k] = suffix.toLowerCase().replace(/\s/g, '').split(',');
        }
    }
}

/**
 * 获取真正处理的文件
 *
 * @inner
 * @param {Versioning} processor 版本号处理器
 * @param {ProcessContext} processContext 构建环境对象
 * @return {Array.<Object>}
 */
function getProcessFiles(processor, processContext) {
    var filter = processor.filter;
    if (typeof filter !== 'function') {
        filter = function (file) {
            return !(/^dep\//.test(file.path));
        };
    }

    // 滤掉 dep 下文件
    return processContext.getFiles().filter(filter);
}

/**
 * 过滤掉不处理的 require 资源文件
 *
 * @inner
 * @param {Array.<Object>} files 原始要处理的资源文件列表
 * @param {Versioning} processor 版本号处理器
 * @return {Array.<Object>}
 */
function filterRequireFiles(files, processor) {
    var jsFilePaths = processor.jsFilePaths || [];
    var requireResource = processor.requireResource;

    // 要滤掉的普通 js 文件
    var ignoreJsFileMap = {};
    jsFilePaths.forEach(function (value) {
        ignoreJsFileMap[value] = 1;
    });

    // 初始化要处理的 require 资源文件判断函数
    if (typeof requireResource !== 'function') {
        var resTypes = requireResource.split(',');
        var fileSuffix = processor.fileSuffix;

        requireResource = function (file) {
            var extname = file.extname;

            for (var i = 0, len = resTypes.length; i < len; i++) {
                if (util.isFileTypeOf(
                    extname, fileSuffix[resTypes[i].toLowerCase()] || [])
                    ) {
                    return true;
                }
            }

            return false;
        };
    }

    var result = [];
    var f;
    for (var i = 0, len = files.length; i < len; i++) {
        f = files[i];

        if (requireResource(f) && !ignoreJsFileMap[f.path]) {
            result.push(f);
        }
    }

    return result;
}

/**
 * 版本化处理器
 *
 * @constructor
 * @param {Object} options 初始化参数
 *
 * @param {string=} options.sourceRoot 源文件的跟目录，默认 'src' ，可选
 *
 * @param {Object=} options.fileSuffix 自定义的文件类型后缀
 * @param {string=} options.fileSuffix.tpl 模板文件后缀，多个以英文逗号分隔，可选，默认 'tpl,html'
 * @param {string=} options.fileSuffix.js js文件后缀，多个以英文逗号分隔，可选，默认 'js'
 * @param {string=} options.fileSuffix.css css文件后缀，多个以英文逗号分隔，可选，默认 'css,less'
 * @param {string=} options.fileSuffix.img 图片文件后缀，多个以英文逗号分隔，可选，默认 'png,jpg,gif'
 *
 * @param {Array.<string>=} options.jsFilePaths 要加上版本号信息的内联js文件路径，可选
 *
 * @param {Array.<string>=} options.cssFilePaths 要加上版本号信息的内联css文件路径，可选
 * @param {Array.<string>=} opitons.autoScanCss 可以指定自动扫描所有css文件，为其引用
 *                          添加版本号信息，如果设为 true，会忽略`cssFilePaths` 的设置，
 *                          可选，默认false
 *
 * @param {Array.<string>=} options.imgFilePaths 要加上版本号信息的图片文件路径，可选
 * @param {boolean} options.autoScanImg 可以指定自动扫描所有img文件，为其引用
 *                          添加版本号信息，如果设为 true，会忽略`imgFilePaths` 的设置，
 *                          可选，默认false
 *
 * @param {string|function(Object):boolean=} options.requireResource
 *                         要处理的 require 资源类型，如果配置了 `jsFilePaths` ，默认会
 *                         忽略这些文件，可以指定要要处理的 require 的资源类型：'tpl',
 *                         'js','css', 多个以英文逗号分隔，资源类型定义见 `fileSuffix` ，
 *                         也可以传入 function，自行判断是否要处理该文件，
 *                         默认为 `js`, `tpl`，可选
 *
 * @param {function(Object):boolean=} options.filter 自定义的过滤器，如果文件是要被处理
 *                                    return true，默认不处理 `dep` 目录下的资源文件，
 *                                    可选
 *
 * @param {number=} options.pathPrefixDepth 要生成版本号信息路径前缀映射关系的路径深度，
 *                  值必须大于0，以src作为根节点开始计算，根节点深度为0，把该值设成该文件树
 *                  最大高度或者大于该高度的值，其等价于基于文件级别的MD5值生成方案。
 *                  可选，默认2。
 *                  e.g, src/a/b/c.js; src/a/b/c/d/f.js; src/e.js
 *                  如果深度为2，只会为src/e.js（文件级别所处深度若小于给定深度，也会生成相应
 *                  版本号信息）及src/a/b的路径前缀加上版本号信息映射关系:
 *                  {
 *                      'e.js': 'v=ecc0a9a81c40a65a',
 *                      'a/b': 'v=0a2009174f4df6b2'
 *                  }
 *
 * @param {string|function(Object)} options.output
 *                                  1) 路径前缀的版本号信息要输出到文件的路径
 *                                  2) 或者自定义的回调函数用于处理输出的版本号信息
 *                                  3) 或者用于输出
 *                                  版本号信息的版本号占位符，格式必须满足如下正则表达式：
 *                                  /^('|")?[\w-]+('|")?$/。
 *                                  输出到文件的版本号信息内容格式：
 *                                  require.config({ urlArgs: {
 *                                      'pahtPrefix1': 'v=abc',
 *                                      'pathPrefix2': 'v=efg',
 *                                      ...
 *                                  } });
 */
function Versioning(options) {
    AbstractProcessor.call(this, options);

    // 初始化文件后缀信息
    initFileSuffixInfo(this);

    // 初始化源文件的根目录
    this.sourceRoot || (this.sourceRoot = 'src');
    this.sourceRootRegExp = new RegExp('^' + this.sourceRoot + '/');

    // 初始化要处理的requir资源类型
    var fileSuffix = this.fileSuffix;
    var sourceRootRegExp = this.sourceRootRegExp;
    this.requireResource || (this.requireResource = function (file) {
        var filePath = file.path;
        var extname = file.extname;

        return (sourceRootRegExp.test(filePath)
            && (
                util.isFileTypeOf(extname, fileSuffix['js'])
                || util.isFileTypeOf(extname, fileSuffix['tpl'])
                )
            );
    });

    // 初始化要加上版本号信息的 js 资源
    Array.isArray(this.jsFilePaths) || (this.jsFilePaths = []);

    // 初始化要加上版本号信息的 css 资源
    Array.isArray(this.cssFilePaths) || (this.cssFilePaths = []);

    (+this.pathPrefixDepth > 0) || (this.pathPrefixDepth = 2);
}

Versioning.prototype = new AbstractProcessor();

/**
 * 处理器名称
 *
 * @type {string}
 */
Versioning.prototype.name = 'Versioning';

/**
 * 构建处理前的行为，选择要处理的文件
 *
 * @param {ProcessContext} processContext 构建环境对象
 * @override
 */
Versioning.prototype.beforeAll = function (processContext) {

    // 为了确保处理器只执行一次，这里初始化要处理的文件为一个，
    // 真正处理的文件 {@link getProcessFiles}
    var files = processContext.getFiles();
    this.processFiles = files.length > 0 ? [files[0]] : [];
};

/**
 * 路径前缀级别的MD5值生成方案。
 * [+] 优点：相比于下述基于文件级别的MD5值生成方案，生成规则更少，对于esl加载资源效率更高
 * [-] 问题：如果目录a下有N个文件，只有一个文件发生变化，如果请求规则路径前缀是基于a，则会导致所有
 *     没有变化文件也会重新请求一遍。
 *     此外还有个问题，对于存在同名文件及目录，如果目录a没变化而a文件变化，目录a同样会重新请求。
 *
 * 1）为JS模块文件、模板文件添加请求的MD5版本号信息，只生成{@link pathPrefixDepth}深度的
 * 前缀的版本号信息，以该前缀所对应的文件/目录的修改时间作为版本号信息；
 *
 * 2）index.html引用的样式文件添加MD5值作为版本号
 *
 * INFO: 基于ESL的require.config#urlArgs参数实现。
 *
 * NOTICE: 该版本化处理器对于项目的 `dep` 目录不会做处理，这里也不建议手动去修改 `dep` 东西，
 *         而是应该由 `dep` 自身的版本号来确保是否有升级，同时这也可以提高 build 效率。
 *         如果有定制需求，可以通过 `filter` 选项
 *
 * @override
 */
Versioning.prototype.process = function (file, processContext, callback) {
    var files = getProcessFiles(this, processContext);

    // 初始化 `esl` require 的资源的版本信息
    var versionMap = requireMd5Generator(this, filterRequireFiles(files, this));

    // 初始化 `js文件` 的版本信息
    var jsVersionMap = inlineMd5Generator.generateJSFileVersion(this, files);

    // 初始化 `css文件` 的版本信息
    var cssVersionMap = inlineMd5Generator.generateCSSFileVersion(this, files);

    // 更新引用的资源的路径：为其加上版本号信息
    updateResourceReference(
        this, files, util.mixin(versionMap, jsVersionMap, cssVersionMap)
    );

    // 为 `img文件` 添加版本号信息
    imgVersioning(
        this, files, inlineMd5Generator.generateImgVersion(this, files)
    );

    callback();
};

module.exports = exports = Versioning;