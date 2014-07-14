/**
 * @file 版本化处理器：自动生成指定路径前缀的版本号信息的映射关键，同时根据指定的css/js文件路径，
 *       生成版本号信息，版本号基于MD5值生成。
 *       NOTICE: 该版本化处理器对于项目的 `dep` 目录不会做处理
 *
 * 使用方式：
 * new Versioning(
 *     {
 *         jsFilePaths: ['src/common/a.js'],
 *         cssFilePaths: ['src/common/css/main.less'],
 *         pathPrefixDepth: 3,
 *         output: 'src/version.js'
 *                | function (pathVersionMap, files) {}
 *                | '"output-path-version-here"'
 *     }
 * )
 *
 * @author wuhuiyao
 */

var inlineMd5Processor = require('./lib/inline-resource-md5');
var requireMd5Processor = require('./lib/require-resource-md5');

/**
 * 更新引用的资源的路径：为引用的资源路径加上版本号信息，或者替换资源文件的版本号信息的占位符
 * NOTICE: 这里只对非dep目录下的模板文件或者html文件的资源引用加上版本号信息其它忽略
 *
 * @param {Array.<Object>} files 要处理的文件对象列表
 * @param {Object} versionMap 资源文件的版本号信息
 */
function updateResourceReference(files, versionMap) {

    // 缓存下面要查找替换的正则表达式
    var regexpMap = {};
    for (var key in versionMap) {
        regexpMap[key] = new RegExp(key, 'g');
    }

    for (var i = 0, len = files.length; i < len; i++) {
        var fileInfo = files[i];

        if (/html|tpl/i.test(fileInfo.extname)) {
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
 * 版本化处理器
 *
 * @constructor
 * @param {Object} options 初始化参数
 * @param {Object} options.files
 * @param {Array.<string>=} options.jsSuffixs js后缀，可选，默认'js'
 * @param {Array.<string>=} options.jsFilePaths 要加上版本号信息的js文件路径，可选
 * @param {Array.<string>=} options.cssSuffixs css后缀，可选，默认'css', 'less'
 * @param {Array.<string>=} options.cssFilePaths 要加上版本号信息的css文件路径，可选
 *                          跟cssDirs可以配合使用
 * @param {Array.<string>=} opitons.cssDirs 要扫描的css目录，对于找到的css文件会为其引用
 *                          添加版本号信息，可选
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

    // 初始化要加上版本号信息的 js 资源
    var jsSuffixs = (this.jsSuffixs || (this.jsSuffixs = ['js']));
    jsSuffixs.forEach(function (value, idx) {
        jsSuffixs[idx] = value.toLowerCase();
    });
    Array.isArray(this.jsFilePaths) || (this.jsFilePaths = []);

    // 初始化要加上版本号信息的 css 资源
    var cssSuffixs = (this.cssSuffixs || (this.cssSuffixs = ['css', 'less']));
    cssSuffixs.forEach(function (value, idx) {
        cssSuffixs[idx] = value.toLowerCase();
    });
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
Versioning.prototype.beforeAll = function ( processContext ) {

    // 为了确保处理器只执行一次，这里初始化要处理的文件为一个，
    // 真正处理的文件 {@link getProcessFiles}
    var files = processContext.getFiles();
    this.processFiles = files.length > 0 ? [files[0]] : [];
};

/**
 * 获取真正处理的文件
 *
 * @inner
 * @param {ProcessContext} processContext 构建环境对象
 * @return {Array.<Object>}
 */
function getProcessFiles(processContext) {

    // 滤掉 dep 下文件
    return processContext.getFiles().filter(
        function (file) {
            return !(/^dep\//.test(file.path));
        }
    );
}

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
 *
 */
Versioning.prototype.process = function (file, processContext, callback) {
    var files = getProcessFiles(processContext);

    // 初始化 `esl` require 的资源的版本信息
    var versionMap = {};
    requireMd5Processor(this, files, versionMap);

    // 初始化 `js文件` 的版本信息
    inlineMd5Processor.initJSFileVersionInfo(this, files, versionMap);

    // 初始化 `css文件` 的版本信息
    inlineMd5Processor.initCSSFileVersionInfo(this, files, versionMap);

    // 更新引用的资源的路径：为其加上版本号信息
    updateResourceReference(files, versionMap);

    callback();
};

module.exports = exports = Versioning;