/**
 * @file 版本化处理器：自动生成指定路径前缀的版本号信息的映射关键，同时根据指定的css/js文件路径，
 *       生成版本号信息，版本号基于MD5值生成。
 *       NOTICE: 该版本化处理器默认对于项目的 `dep` 目录不会做处理
 *
 * @author wuhuiyao
 */

var edpBuildHelper = require('edp-build-helper');
var util = require('./lib/util');
var inlineMd5Generator = require('./lib/inline-resource-md5');
var requireMd5Generator = require('./lib/require-resource-md5');
var cssURLVersioning = require('./lib/css-url-versioning');

var ASYNC_REQUIRE_REGEXP = /\s+require\s*\(\s*\[[^\]]+\]\s*[\)|,]/g;
var SYNC_REQUIRE_REGEXP = /(require\(\s*['"])([^'"]+)(['"]\s*\))/g;
var MODULE_DEFINE_REGEXP = /\s*define\(\s*(['"])([^'"]+)['"]\s*,\s*\[[^\[\]]*?\]/g;

/**
 * 查找入口模块信息
 *
 * @param {Object} processor
 * @param {Array.<Object>} files 要处理的文件
 * @param {Object} versionMap 版本号信息
 * @return {Object}
 */
function findEntryModuleInfo(processor, files, versionMap) {
    var pageEntryModuleMap = {};

    for (var i = 0, len = files.length; i < len; i++) {
        var fileInfo = files[i];

        if (processor.updateTarget(fileInfo)) {

            // 查找入口模块
            var moduleIds = edpBuildHelper.extractEntryModuleIds(fileInfo.data);
            if (!moduleIds.length) {
                continue;
            }

            // 初始化入口模块的版本号信息
            var pageModuleVersionMap = {};
            for (var m = 0, mLen = moduleIds.length; m < mLen; m++) {
                var mId = moduleIds[m];
                if (versionMap[mId]) {
                    pageModuleVersionMap[mId] = versionMap[mId];
                }
            }

            if (Object.keys(pageModuleVersionMap).length) {
                pageEntryModuleMap[fileInfo.outputPath] = {
                    file: fileInfo,
                    versionInfo: pageModuleVersionMap
                };
            }
        }
    }

    return pageEntryModuleMap;
}

/**
 * 按页面输出 require 的模块版本信息，即只是输出当前页面引用的模块的版本号信息
 *
 * @param {Object} processor
 * @param {Array.<Object>} files 要处理的文件
 * @param {Object} versionMap 版本号信息
 * @return {{value: string}}
 */
function outputRequireVersionInfoByPage(processor, files, versionMap) {
    var outputModuleIdMap = {};
    var pageEntryModuleInfo = findEntryModuleInfo(processor, files, versionMap);

    Object.keys(pageEntryModuleInfo).forEach(function (path) {
        var item = pageEntryModuleInfo[path];
        var versionInfo = item.versionInfo;
        var fileInfo = item.file;

        // 初始化已经输出的模块信息
        Object.keys(versionInfo).forEach(function (moduleId) {
            outputModuleIdMap[moduleId] = 1;
        });

        // 输出入口模块的版本号信息的 require.config 配置信息
        var requireUrlArgs = '\nrequire.config({ urlArgs: '
            + JSON.stringify(versionInfo) + ' }); ';
        var replaced;
        fileInfo.data = fileInfo.data.replace(ASYNC_REQUIRE_REGEXP, function (match) {
            if (replaced) {
                return match;
            }

            replaced = true;
            return requireUrlArgs + match;
        });
    });

    // 输出指定的模块 id 的版本号信息, 过滤掉已经输出过的入口模块版本号信息
    var newVersionMap = {};
    var versionModuleIds = processor.moduleIds;
    if (versionModuleIds && versionModuleIds.length) {
        versionModuleIds.forEach(function (id) {
            if (versionMap[id]) {
                if (!outputModuleIdMap[id]) {
                    newVersionMap[id] = versionMap[id];
                }
            }
            else {
                console.error('edp build versiong cannot process unknown module id: ' + id);
            }
        });
    }

    return {
        value: (Object.keys(newVersionMap).length)
            ? JSON.stringify(newVersionMap) : '\'\''
    };
}

/**
 * 更新 异步 require 的 模块 id
 *
 * @param {Object} processFile 要更新的文件
 * @param {Object} renameModuleMap 要重命名的信息 map
 */
function updateAsyncRequireModule(processFile, renameModuleMap) {
    processFile.data = processFile.data.replace(ASYNC_REQUIRE_REGEXP, function (match) {
        Object.keys(renameModuleMap).forEach(function (moduleId) {
            var regexp = new RegExp('[\'"]' + moduleId + '[\'"]');
            match = match.replace(
                regexp,
                '\'' + renameModuleMap[moduleId].renameModuleId + '\''
            );
        });

        return match;
    });
}

/**
 * 更新 同步 require 的 模块 id
 *
 * @param {Object} processFile 要更新的文件
 * @param {Object} renameModuleMap 要重命名的信息 map
 * @param {Object} processor 处理器
 */
function updateSyncRequireModule(processFile, renameModuleMap, processor) {
    var data = processFile.data;
    var moduleDatas = [];

    var matches;
    var lastMatch;
    var currMatch;
    while ((matches = MODULE_DEFINE_REGEXP.exec(data))) {
        currMatch = {index: matches.index, quot: matches[1], moduleId: matches[2]};
        if (lastMatch) {
            lastMatch.data = data.substring(lastMatch.index, currMatch.index);
            moduleDatas.push(lastMatch);
        }
        lastMatch = currMatch;
    }
    if (lastMatch) {
        lastMatch.data = data.substr(lastMatch.index);
        moduleDatas.push(lastMatch);
    }

    moduleDatas = moduleDatas.map(function (item) {
        var data = item.data;
        var quot = item.quot;
        var moduleId = item.moduleId;
        var rewritedModuleIdMap = {};
        return data.replace(SYNC_REQUIRE_REGEXP, function ($0, $1, depId, $3) {
            // 对于插件 require 的模块直接跳过
            if (depId.indexOf('!') !== -1) {
                return $0;
            }

            var depModuleId = util.getAbsoluteModuleId(moduleId, depId);
            var renameModuleInfo = renameModuleMap[depModuleId];
            if (!renameModuleInfo) {
                return $0;
            }

            var replaceRegexp = new RegExp(util.getFileName(depId) + '$');
            var renameDepId = depId.replace(replaceRegexp, renameModuleInfo.version);
            rewritedModuleIdMap[depId] = {
                replacer: new RegExp('([\'"])' + depId + '\\1'),
                renameDepId: renameDepId
            };

            return $1 + renameDepId + $3;
        }).replace(
            MODULE_DEFINE_REGEXP,
            function (match) {

                // 更新 define 的 module id
                var renameModuleInfo = renameModuleMap[moduleId];
                if (renameModuleInfo) {
                    match = match.replace(
                        quot + moduleId + quot,
                        quot + renameModuleInfo.renameModuleId + quot
                    );
                }

                // 更新 define 的 module depend module ids
                Object.keys(rewritedModuleIdMap).forEach(function (depId) {
                    var replaceInfo = rewritedModuleIdMap[depId];
                    match = match.replace(
                        replaceInfo.replacer,
                        '$1' + replaceInfo.renameDepId + '$1'
                    );
                });

                return match;
            }
        );
    });

    processFile.data = moduleDatas.join('');
}

/**
 * 更新 require 的 模块 id
 *
 * @param {Object} processor 处理器
 * @param {Array.<Object>} files 要处理的文件
 * @param {Object} renameModuleMap 要重命名的信息 map
 */
function updateRequireModuleId(processor, files, renameModuleMap) {
    var tplSuffix = processor.fileSuffix.tpl;
    var jsSuffix = processor.fileSuffix.js;

    for (var i = 0, len = files.length; i < len; i++) {
        var fileInfo = files[i];
        var extname = fileInfo.extname;
        if (util.isFileTypeOf(extname, tplSuffix)) {
            updateAsyncRequireModule(fileInfo, renameModuleMap);
        }
        else if (util.isFileTypeOf(extname, jsSuffix)) {
            updateAsyncRequireModule(fileInfo, renameModuleMap);
            updateSyncRequireModule(fileInfo, renameModuleMap, processor);
        }
    }
}

/**
 * 重写 require 模块 路径信息
 *
 * @param {Object} processor 处理器
 * @param {Array.<Object>} files 要处理的文件
 * @param {Object} versionMap 版本号信息 map
 */
function rewriteRequireModulePath(processor, files, versionMap) {
    var toRenameModuleMap = {};

    var initToRenameModuleInfo = function (versionInfo, moduleId) {
        if (toRenameModuleMap[moduleId]) {
            return;
        }

        var fileInfo = util.findFileByPath(
            processor.sourceRoot + '/' + moduleId + '.js', files, true
        );

        if (!fileInfo) {
            console.error('edp build versioning find moduleId:%s file fail!', moduleId);
            return;
        }

        var version = versionInfo[moduleId];
        var outputPath = processor.getRenameFilePath(fileInfo.outputPath, version);
        fileInfo.outputPath = outputPath;

        var renameModuleId = processor.getModuleId(outputPath);
        toRenameModuleMap[moduleId] = {
            path: fileInfo.path,
            moduleId: moduleId,
            renameModuleId: renameModuleId,
            version: util.getFileName(outputPath)
        };
    };

    // 初始化入口模块
    var pageEntryModuleInfo = findEntryModuleInfo(processor, files, versionMap);
    Object.keys(pageEntryModuleInfo).forEach(function (path) {
        var item = pageEntryModuleInfo[path];
        var versionInfo = item.versionInfo;
        var handler = initToRenameModuleInfo.bind(this, versionInfo);
        Object.keys(versionInfo).forEach(handler);
    });

    // 初始化自定义要增加版本号的模块
    var handler = initToRenameModuleInfo.bind(this, versionMap);
    (processor.moduleIds || []).forEach(handler);

    // 更新 require 引用
    updateRequireModuleId(processor, files, toRenameModuleMap);
}


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

    // 预处理下对于需要按页面输出 require 模块的版本号信息
    var keys = Object.keys(versionMap);
    keys.forEach(function (k) {
        var item = versionMap[k];
        var versionInfo = item.value;

        if (item.outputByPage) {
            versionMap[k] = outputRequireVersionInfoByPage(processor, files, versionInfo);
        }
    });

    for (var i = 0, len = files.length; i < len; i++) {
        var fileInfo = files[i];

        if (processor.updateTarget(fileInfo)) {
            for (key in versionMap) {
                var value = versionMap[key];

                // 如果是一个object，则认为只是简单变量替换
                if (typeof value === 'object') {
                    value = util.stringify(value.value);
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
    css: 'css,less,styl',
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
    var files = processContext.getFiles().filter(filter);
    return files.filter(function (file) {
        // edp 处理的文件列表里，不知道为啥会出现 null 情况，这里把这种文件给滤掉
        return file.outputPath != null && file.path != null;
    });
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
 * @param {string=} options.fileSuffix.css css文件后缀，多个以英文逗号分隔，可选，默认 'css,less,styl'
 * @param {string=} options.fileSuffix.img 图片文件后缀，多个以英文逗号分隔，可选，默认 'png,jpg,gif'
 *
 * @param {number=}  options.md5length 计算的 md5 版本号长度，可选，默认8
 * @param {boolean=} options.rename 是否重命名文件方式添加 md5 还是加查询参数方式，可选，
 *                   默认加查询参数方式，对于 `require` 模块只对开启 `combine` 选项才会
 *                   重写模块文件名
 *
 * @param {boolean=} opitons.autoScanCss 可以指定自动扫描所有css文件，为其引用
 *                          添加版本号信息，如果设为 true，会忽略`cssFilePaths` 的设置，
 *                          可选，默认false
 *@param {Array.<string>=} options.filePaths 要加上版本号信息的文件路径，可选
 *                          该选项只是简单对于指定的文件路径的引用加上 md5 值作为版本号
 *
 * @param {Array.<string>|boolean=} options.cssURL 是否为 css 定义的 url 引用的资源文件添加
 *                                  版本号信息，可选，默认 false
 *                                  若要为所有 css url 引用的资源添加版本号，设为 true
 *                                  或者指定要添加版本号的资源路径
 *
 * @param {Object=} options.require 配置 require 的资源的添加版本号方式，可选，默认不添加
 * @param {boolean|Array.<string>=} options.require.combine 只为合并的模块生成md5值
 *                  作为版本号，设置该项默认会读取 `module.conf` 的 `combine`
 *                  配置，作为生成版本号的模块，也可以传入一个自定义要生成模块版本号的模块
 *                  id 列表，该列表会与 `module.conf` 的 `combine` 定义的值做合并
 *                  可选，默认使用 `pathPrefixDepth` 生成
 * @param {number=} options.require.pathPrefixDepth 要生成版本号信息路径前缀映射关系的路
 *                  径深度，值必须大于0，以src作为根节点开始计算，根节点深度为0，把该值设成该文
 *                  件树最大高度或者大于该高度的值，其等价于基于文件级别的MD5值生成方案。
 *                  可选，默认2。
 *                  e.g, src/a/b/c.js; src/a/b/c/d/f.js; src/e.js
 *                  如果深度为2，只会为src/e.js（文件级别所处深度若小于给定深度，也会生成相应
 *                  版本号信息）及src/a/b的路径前缀加上版本号信息映射关系:
 *                  {
 *                      'e.js': 'v=ecc0a9a81c40a65a',
 *                      'a/b': 'v=0a2009174f4df6b2'
 *                  }
 * @param {string|function(Object)} options.require.output
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
 * @param {string=} options.require.defaultOutput 默认版本号输出的位置，值
 *                  同 `require.output` 字符串情况，默认版本号为时间戳，可选
 * @param {boolean=} options.require.outputByPage 根据每个页面输出该页面入口模块用到的
 *                  模块的版本信息，而不是所有页面引用所有每个页面入口模块版本号信息，可选，
 *                  默认 false，当前只针对 `require.combine` 选项开启时才有效
 * @param {function()=} options.require.version 自定义的版本号生成器，可选，默认基于 md5
 *                      该方法会传入当前要处理的require的文件 requireFiles 参数，该方法要求
 *                      返回特定路径前缀的版本号 map 或者所有 requireFiles 的版本号字符串
 *                      （比如时间戳）
 * @param {string|function(Object):boolean=} options.require.filter
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
 * @param {Array.<string>=} options.jsFilePaths    deprecated
 *                          用 filePaths 选项, 要加上版本号信息的内联js文件路径，可选
 * @param {Array.<string>=} options.cssFilePaths   deprecated
 *                          用 filePaths 选项, 要加上版本号信息的内联css文件路径，可选
 * @param {Array.<string>=} options.imgFilePaths   deprecated
 *                          用 cssURL 选项, 要加上版本号信息的图片文件路径，可选
 * @param {boolean=} options.autoScanImg           deprecated
 *                          用 cssURL 选项, 可以指定自动扫描所有img文件，为其引用
 *                          添加版本号信息，如果设为 true，会忽略`imgFilePaths` 的设置，
 *                          可选，默认false
 * @param {number=} options.requireResource        deprecated
 *                          使用 require.filter 选项
 * @param {number=} options.pathPrefixDepth        deprecated
 *                          使用 require.pathPrefixDepth 选项
 * @param {string|function(Object)} options.output deprecated
 *                          使用 require.output 选项
 */
function Versioning(options) {
    AbstractProcessor.call(this, options);

    // 初始化 md5 版本号长度
    this.md5Length || (this.md5Length = 8);

    // 初始化文件后缀信息
    initFileSuffixInfo(this);

    // 初始化源文件的根目录
    this.sourceRoot || (this.sourceRoot = 'src');
    this.sourceRootRegExp = new RegExp('^' + this.sourceRoot + '/');

    // 初始化要处理的 require 资源版本号选项
    var requireOption = this.require || {};
    this.requireFilter = this.requireResource || requireOption.filter || 'js,tpl';

    if (!this.pathPrefixDepth) {
        this.pathPrefixDepth = requireOption.pathPrefixDepth;
    }
    (+this.pathPrefixDepth > 0) || (this.pathPrefixDepth = 2);

    // 初始化要生成版本号的模块 id
    if (requireOption.combine) {
        // 重置路径前缀深度，改为输出所有模块路径的版本号信息
        this.pathPrefixDepth = Number.MAX_VALUE;
        var combineConf = edpBuildHelper.readModuleConfSync().combine || {};
        var combineModuleIds = Object.keys(combineConf);
        if (Array.isArray(requireOption.combine)) {
            var customCombine = requireOption.combine;
            customCombine.forEach(function (id) {
                if (combineModuleIds.indexOf(id) === -1) {
                    combineModuleIds.push(id);
                }
            });
        }
        this.moduleIds = combineModuleIds;
        this.requireOutputByPage = !!requireOption.outputByPage;
        this.combine = true;
    }

    this.requireOutput = this.output || requireOption.output;
    this.requireDefaultOutput = requireOption.defaultOutput;
    this.requireVersion = requireOption.version;

    // 初始要更新资源引用的版本号的目标文件，默认只更新 模板文件
    this.updateTarget || (this.updateTarget = 'tpl');
    var updateTarget = this.updateTarget;
    if (typeof updateTarget !== 'function') {
        var resTypes = updateTarget.split(',');
        var fileSuffix = this.fileSuffix;

        this.updateTarget = function (file) {
            return util.isFileTypeMatch(file, resTypes, fileSuffix);
        };
    }
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
 * NOTICE: 该版本化处理器对于项目的 `dep` 目录不会做处理，这里也不建议手动去修改 `dep` 东西，
 *         而是应该由 `dep` 自身的版本号来确保是否有升级，同时这也可以提高 build 效率。
 *         如果有定制需求，可以通过 `filter` 选项
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
 * 处理资源版本号信息
 *
 * @override
 */
Versioning.prototype.process = function (file, processContext, callback) {
    var files = getProcessFiles(this, processContext);

    // 为 css 引用的 `img文件` 等资源 添加版本号信息: 这里必须放在前面执行，
    // 否则会影响后续文件md5计算
    cssURLVersioning(this, files, inlineMd5Generator.generateImgVersion(this, files));

    // 初始化 `css文件`、 `js文件` 等内联资源的版本号信息
    var inlineVersionMap = inlineMd5Generator.generateInlineFileVersion(this, files);

    // 初始化 `esl` require 的资源的版本信息
    var requireVersionMap = requireMd5Generator(this, files);

    // 对于指定要输出版本号的模块且重命名情况下，重写模块名称，不使用 `urlArgs` 方式
    if (this.combine && this.rename) {
        var me = this;
        Object.keys(requireVersionMap).some(function (k) {
            var item = requireVersionMap[k];
            var versionInfo = item.value;

            if (!item.defaultVersion) {
                rewriteRequireModulePath(me, files, versionInfo);
                requireVersionMap[k] = {value: '\'\''};
                return true;
            }
        });
    }

    // 更新引用的资源的路径：为其加上版本号信息
    updateResourceReference(
        this, files, util.mixin(inlineVersionMap, requireVersionMap)
    );

    callback();
};

/**
 * 获取重命名的文件路径，格式为：<fileName>_<md5version>.<js>
 *
 * @param {string} filePath 原始文件路径
 * @param {string} version 要添加的版本号信息
 * @return {string}
 */
Versioning.prototype.getRenameFilePath = function (filePath, version) {
    return filePath.replace(/(\.[^\.]+$)/, '_' + version + '$1');
};

/**
 * 获取给定 JS 文件路径对应的模块 id
 *
 * @param {string} filePath 模块文件路径
 * @return {string}
 */
Versioning.prototype.getModuleId = function (filePath) {
    var renameModuleId = filePath.replace(this.sourceRootRegExp, '');
    return util.removePathExtName(renameModuleId);
};

/**
 * 对外暴露助手工具方法
 *
 * @type {Object}
 */
Versioning.helper = edpBuildHelper;

module.exports = exports = Versioning;
