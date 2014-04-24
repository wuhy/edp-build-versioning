/**
 * @file 版本化处理器：自动生成指定路径前缀的版本号信息的映射关键，同时根据指定的css文件路径，
 *       生成版本号信息，版本号基于MD5值生成。
 *       NOTICE: 只处理src下css/html/js文件的版本号
 *
 * 使用方式：
 * new Versioning(
 *     {
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

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

/**
 * 对FileInfo对象进行md5sum
 *
 * @param {FileInfo|string} file 文件信息对象或者要计算md5sum的内容
 * @return {string}
 */
function md5sum(file, start, end) {
    var data;
    var isFile = typeof file !== 'string';

    var result;
    if (isFile) {
        result = file.get('md5sum');
        if (result) {
            return result;
        }

        data = file.getDataBuffer();
    }
    else {
        data = new Buffer(file, 'utf-8');
    }

    start = start || 0;
    end = end || 16;//32;

    var md5 = crypto.createHash('md5');
    md5.update(data);

    result = md5.digest('hex').slice(start, end);
    isFile && file.set('md5sum', result);

    return result;
}

/**
 * 判断给定的文件对象是否是Src下的JS文件
 *
 * @param {Object} fileInfo 要check的文件对象
 * @return {boolean}
 */
function isSrcJSFile(fileInfo) {
    return /^src/.test(fileInfo.path) && /js/i.test(fileInfo.extname);
}

/**
 * 判断给定的文件对象是否是Src下的Tpl文件
 *
 * @param {Object} fileInfo 要check的文件对象
 * @return {boolean}
 */
function isSrcTplFile(fileInfo) {
    return /^src/.test(fileInfo.path) && /html|tpl/i.test(fileInfo.extname);
}

/**
 * 规范化给定的文件路径
 *
 * @param {string} srcPath 路径
 * @return {string}
 */
function normalizePath(srcPath) {
    return path.normalize(srcPath).replace( /\\/g, '/' );
}

// ============= Path Pefix MD5 Versioning ============== //

/**
 * 收集给定的版本树深度的版本信息，返回给定深度的路径前缀的版本信息
 *
 * @param {Object} root 原始的版本树的跟节点
 * @param {number} depth 要收集的版本子树的深度
 * @return {Object} key为给定深度的路径前缀，value为对应该路径前缀深度的md5版本号
 */
function collectPathVersion(root, depth) {
    var pathVersionMap  = {};
    var proceeNodeQueue = [root];

    // 宽度优先遍历节点
    while (proceeNodeQueue.length > 0) {
        var currNode = proceeNodeQueue.shift();
        currNode.children.forEach(function (n) {
            proceeNodeQueue.push(n);
        });

        // 如果当前深度已经超过要遍历的深度，退出，停止遍历
        if (currNode.depth > depth) {
            break;
        }

        // 跳过根节点
        if (currNode.isRoot) {
            continue;
        }

        // 存储叶子节点或者深度为给定深度的非叶子节点所对应的path的md5值信息
        var md5 = null;
        if (currNode.depth === depth) {
            // 对于深度为当前查询深度的，存在同名文件（文件夹）使用备用的md5值
            md5 = currNode.optMd5 || currNode.md5;
        }
        else if (currNode.isLeaf) {
            md5 = currNode.md5;
        }

        if (md5) {
            md5 = md5.slice(0, 16); // 取前16位作为版本号
            var pathPrefix = currNode.id.replace(/^src\/|\.(js|html|tpl)$/g, '');
            pathVersionMap[pathPrefix] = 'v=' + md5;
        }
    }

    return pathVersionMap;
}

/**
 * 基于文件树，创建Md5版本树
 *
 * @param {Array.<Object>} files 要创建Md5版本树的文件列表
 * @param {function(Object):boolean} filter 要过滤掉的文件，对于要处理的文件，返回true
 * @return {{id: string, name: string, children: Array, isRoot: boolean, depth: number}}
 */
function createMd5VersionTree(files, filter) {
    var md5FileMap = {};

    for (var k = 0, len = files.length; k < len; k++) {
        var fileInfo = files[k];

        if (filter(fileInfo)) {
            md5FileMap[fileInfo.path] = nodeMd5sum(fileInfo);
        }
    }

    var root = { id: 'src', name: 'src', children: [], isRoot: true, depth: 0 };
    var nodeMap = {};
    nodeMap[root.id] = root;

    for (var path in md5FileMap) {
        var segments = path.split('/');
        var nodeId = '';
        var node;
        var parentNode = root;

        for (var i = 0, lastIdx = segments.length - 1; i <= lastIdx; i++) {
            if (i !== 0) {
                nodeId += '/';
            }
            nodeId += segments[i];

            // 对于a/b.js的b.js节点名称应该为b否则如果同级出现一个a/b目录，就无法判断同名节点
            var name = segments[i];
            if (i === lastIdx) {
                name = name.substring(0, name.lastIndexOf('.'));
            }
            if (!(node = nodeMap[nodeId])) {
                node = { id: nodeId, name: name, children: [], depth: i };
                nodeMap[nodeId] = node;
            }

            if (parentNode !== node && parentNode.children.indexOf(node) == -1) {
                parentNode.children.push(node);
            }
            parentNode = node;
        }

        parentNode.isLeaf = true;
        parentNode.md5 = md5FileMap[path];
    }

    // 遍历所有节点，对节点的孩子节点进行排序，确保下面计算非叶子节点的md5值不会动态变化
    sortNodeChildren(root);

    // 遍历所有节点，计算所有节点的md5值
    computeMd5(root);

    return root;
}

function nodeCompare(a, b) {
    var result = a.name.localeCompare(b.name);

    if (!result) {
        // a/b不可能都是同名且都是叶子节点，因此判断一个就行了
        result = a.isLeaf ? 1 : -1;
    }

    return result;
}

function nodeMd5sum(content) {
    return md5sum(content, 0, 32);
}

function sortNodeChildren(node) {
    var children = node.children;
    children.sort(nodeCompare);

    for (var i = 0, len = children.length; i < len; i++) {
        sortNodeChildren(children[i]);
    }
}

function computeMd5(node) {
    if (node.md5) {
        return node.md5;
    }

    var children = node.children;
    var content = '';
    for (var i = 0, len = children.length; i < len; i++) {
        content += computeMd5(children[i]);
    }
    node.md5 = nodeMd5sum(content);

    // 查找同名的node：最多只有两个：同名文件和文件夹
    var twinsNodeMap = {};
    for (i = 0, len = children.length; i < len; i++) {
        var child = children[i];
        var name = child.name;
        var twins = twinsNodeMap[name] || (twinsNodeMap[name] = []);
        twins.push(child);

        // 对于同名的文件及目录重新计算一个备用的md5值，避免path深度为该叶子节点深度可能会有问题
        // 因为请求a文件及a目录下资源共用一个版本号
        if (twins.length == 2) {
            content = twins[0].md5 + twins[1].md5;
            twins[0].optMd5 = twins[1].optMd5 = nodeMd5sum(content);
        }
    }

    return '';
}

/**
 * 扫描css文件
 *
 * @param {Array.<string>} scanDirs 要扫描的目录
 * @param {Array.<string>} cssFilePaths 扫描到css文件添加到目标数组
 * @param {Array.<string>} cssSuffixs 认为是css文件的css后缀名
 */
function scanCssFilePaths(scanDirs, cssFilePaths, cssSuffixs) {
    for (var i = 0, len = scanDirs.length; i < len; i++) {

        var dir = scanDirs[i];
        var files = fs.readdirSync(dir);

        for (var k = 0, fileNum = files.length; k < fileNum; k++) {
            var item = files[k];
            var filePath = normalizePath(dir + '/' + item);
            var stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                scanCssFilePaths([filePath], cssFilePaths, cssSuffixs);
            }
            else {
                var extName = path.extname(filePath).slice(1).toLowerCase();
                if (cssSuffixs.indexOf(extName) !== -1
                    && cssFilePaths.indexOf(filePath) === -1) {
                    cssFilePaths.push(filePath);
                }
            }
        }

    }
}

// ============= CSS MD5 Versioning ============== //

/**
 * 为css文件生成MD5值作为版本号，返回css文件路径对应的md5值版本号信息Map
 *
 * @param {Array} files 要处理的文件信息数组
 * @return {Object}
 */
function cssVersioning(cssFilePaths, files) {
    if (!cssFilePaths || cssFilePaths.length <= 0) {
        return {};
    }

    var isMatch = function (fileInfo) {
        for (var i = 0, len = cssFilePaths.length; i < len; i++) {
            if (cssFilePaths[i] === fileInfo.path) {
                return true;
            }
        }

        return false;
    };

    var versioningCssMap = {};
    for (var i = 0, len = files.length; i < len; i++) {
        var fileInfo = files[i];

        // 为匹配到css文件生成md5值作为版本号
        if (isMatch(fileInfo)) {
            // 缓存生成的md5
            versioningCssMap[fileInfo.outputPath] = md5sum(fileInfo);
        }
    }

    return versioningCssMap;
}

/**
 * 初始化CSS文件的版本信息
 *
 * @param {Versioning} versionProcessor 版本号处理器
 * @param {Array.<Object>} files 要处理的文件列表
 * @param {Object} versionMap 存储静态资源要添加/替换的版本号信息，
 *                 key为要替换的值或者要添加版本号信息的路径，value为对应的版本号信息
 */
function initCSSFileVersionInfo(versionProcessor, files, versionMap) {

    // 扫描要添加css文件版本号的css文件路径
    versionProcessor.cssFilePaths || (versionProcessor.cssFilePaths = []);
    scanCssFilePaths(
        versionProcessor.cssDirs || [],
        versionProcessor.cssFilePaths,
        versionProcessor.cssSuffixs
    );

    // 为css文件生成md5值作为版本号
    var cssVersionMap = cssVersioning(versionProcessor.cssFilePaths, files);
    for (var k in cssVersionMap) {
        versionMap[k] = cssVersionMap[k];
    }
}

/**
 * 初始化通过 `esl` require的资源的版本信息
 *
 * @param {Versioning} versionProcessor 版本号处理器
 * @param {Array.<Object>} files 要处理的文件列表
 * @param {Object} versionMap 存储静态资源要添加/替换的版本号信息，
 *                 key为要替换的值或者要添加版本号信息的路径，value为对应的版本号信息
 */
function initRequireResourceVersionInfo(versionProcessor, files, versionMap) {

    // 查找用于输出版本号信息的version文件
    var outputOption = versionProcessor.output;
    var outputFile;
    if (typeof outputOption == 'string') {
        for (var i = 0, len = files.length; i < len; i++) {
            if (outputOption === files[i].path) {
                outputFile = files[i];
                break;
            }
        }
    }

    // 生成路径前缀对应的版本号映射信息
    var md5VersionTree = createMd5VersionTree(files, function (processFile) {

        // 不处理版本号要输出的文件及非src下的JS/Tpl文件
        return (outputFile !== processFile)
            && (isSrcJSFile(processFile) || isSrcTplFile(processFile));
    });

    // 基于给定的版本树信息，收集指定的路径深度的版本信息
    var pathVersionMap = collectPathVersion(
        md5VersionTree, versionProcessor.pathPrefixDepth
    );

    if (outputFile) {

        // 输出文件版本号信息并更新html文件引用的路径的版本号信息
        outputFile.data = 'require.config({ urlArgs: '
            + JSON.stringify(pathVersionMap) + ' });';
        versionMap[outputFile.path] = md5sum(outputFile);
    }
    else if (typeof outputOption == 'function') {

        // 执行回调
        outputOption.call(versionProcessor, pathVersionMap, files);
    }
    else if (typeof outputOption == 'string'
        && /^('|")?[\w-]+('|")?$/.test(outputOption)) {

        // 对输入选项值作为要替换版本号信息的变量
        versionMap[outputOption] = { value: JSON.stringify(pathVersionMap) };
    }
}

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

        if (/html|tpl/i.test(fileInfo.extname) && !/^dep\//.test(fileInfo.path)) {
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

    var cssSuffixs = (this.cssSuffixs || (this.cssSuffixs = ['css', 'less']));
    cssSuffixs.forEach(function (value, idx) {
        cssSuffixs[idx] = value.toLowerCase();
    });

    (+this.pathPrefixDepth > 0) || (this.pathPrefixDepth = 2);
    Array.isArray(this.cssFilePaths) || (this.cssFilePaths = []);
}

Versioning.prototype = new AbstractProcessor();

/**
 * 处理器名称
 *
 * @type {string}
 */
Versioning.prototype.name = 'Versioning';

/**
 * 过滤掉不处理文件
 * @return {boolean}
 */
Versioning.prototype.isExclude = function (file) {
    return this.processed;
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
 * NOTICE: 这里只处理src下，对于dep目录一律无视，这里也不建议手动去修改dep东西，而是应该由
 * dep自身的版本号来确保是否有升级，同时这也可以提高build效率。
 *
 */
Versioning.prototype.process = function (file, processContext, callback) {
    var files = processContext.getFiles();

    if (this.processed) {
        callback();
        return;
    }

    // 置为true，确保只执行一次
    this.processed = true;

    // 初始化 `esl` require 的资源的版本信息
    var versionMap = {};
    initRequireResourceVersionInfo(this, files, versionMap);

    // 初始化 `css文件` 的版本信息
    initCSSFileVersionInfo(this, files, versionMap);

    // 更新引用的资源的路径：为其加上版本号信息
    updateResourceReference(files, versionMap);

    callback();
};

module.exports = exports = Versioning;