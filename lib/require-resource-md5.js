/**
 * @file 为 require 资源的生成 md5 版本号信息处理器
 * @author wuhuiyao
 */

var edpBuildHelper = require('edp-build-helper');
var util = require('./util');

function nodeCompare(a, b) {
    var result = a.name.localeCompare(b.name);

    if (!result) {
        // a/b不可能都是同名且都是叶子节点，因此判断一个就行了
        result = a.isLeaf ? 1 : -1;
    }

    return result;
}

function nodeMd5sum(content) {
    return util.md5sum(content, 0, 32);
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
        if (twins.length === 2) {
            content = twins[0].md5 + twins[1].md5;
            twins[0].optMd5 = twins[1].optMd5 = nodeMd5sum(content);
        }
    }

    return node.md5;
}

// ============= Path Pefix MD5 Versioning ============== //

/**
 * 收集给定的版本树深度的版本信息，返回给定深度的路径前缀的版本信息
 *
 * @param {Object} root 原始的版本树的跟节点
 * @param {number} depth 要收集的版本子树的深度
 * @param {RegExp} sourceRootRegExp require的资源的源根目录正则
 * @return {Object} key为给定深度的路径前缀，value为对应该路径前缀深度的md5版本号
 */
function collectPathVersion(root, depth, sourceRootRegExp) {
    var pathVersionMap  = {};
    var proceeNodeQueue = [root];

    // 宽度优先遍历节点
    while (proceeNodeQueue.length > 0) {
        var currNode = proceeNodeQueue.shift();

        var children = currNode.children;
        for (var c = 0, cLen = children.length; c < cLen; c++) {
            proceeNodeQueue.push(children[c]);
        }

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
            var pathPrefix = currNode.id.replace(sourceRootRegExp, '');
            currNode.isLeaf && (pathPrefix = util.removePathExtName(pathPrefix));
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

    var root = {id: 'src', name: 'src', children: [], isRoot: true, depth: 0};
    var nodeMap = {};
    nodeMap[root.id] = root;

    var paths = Object.keys(md5FileMap);
    for (var p = 0, pLen = paths.length; p < pLen; p++) {
        var path = paths[p];
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
                node = {id: nodeId, name: name, children: [], depth: i};
                nodeMap[nodeId] = node;
            }

            if (parentNode !== node && parentNode.children.indexOf(node) === -1) {
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

/**
 * 将给定的版本号信息转成字符串
 *
 * @param {string|Object} versionInfo 版本号信息
 * @return {string}
 */
function stringify(versionInfo) {
    if (typeof versionInfo === 'object') {
        return JSON.stringify(versionInfo);
    }
    return versionInfo;
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
    var processInlineFiles = processor.processInlineFiles || [];
    var requireFilter = processor.requireFilter;

    // 要滤掉的普通资源文件
    var ignoreFileMap = {};
    processInlineFiles.forEach(function (f) {
        ignoreFileMap[f.path] = 1;
    });

    // 初始化要处理的 require 资源文件判断函数
    if (typeof requireFilter !== 'function') {
        var resTypes = requireFilter.split(',');
        var fileSuffix = processor.fileSuffix;
        var sourceRootRegExp = processor.sourceRootRegExp;

        requireFilter = function (file) {
            return sourceRootRegExp.test(file.path)
                && util.isFileTypeMatch(file, resTypes, fileSuffix);
        };
    }

    var result = [];
    var f;
    for (var i = 0, len = files.length; i < len; i++) {
        f = files[i];

        if (!ignoreFileMap[f.path] && requireFilter.call(processor, f)) {
            result.push(f);
        }
    }

    return result;
}

/**
 * 版本号占位符有效性正则
 *
 * @const
 * @type {RegExp}
 */
var VERSION_PLACEHOLDER_REGEXP = /^('|")?[\w-]+('|")?$/;

/**
 * 获取通过 `esl` require的资源的版本信息
 *
 * 默认基于路径前缀级别的MD5值生成方案。
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
 * @param {Versioning} versionProcessor 版本号处理器
 * @param {Array.<Object>} souceFiles 源文件列表
 * @return {Object}
 */
module.exports = exports = function (versionProcessor, souceFiles) {
    var outputOption = versionProcessor.requireOutput;

    if (!outputOption) {
        return {};
    }

    // 查找用于输出版本号信息的version文件
    var outputFile;
    if (typeof outputOption === 'string') {
        for (var i = 0, len = souceFiles.length; i < len; i++) {
            if (outputOption === souceFiles[i].path) {
                outputFile = souceFiles[i];
                break;
            }
        }
    }

    // 生成 require 资源的版本号信息
    var versionModuleIds = versionProcessor.moduleIds;
    var outputVersionInfo;
    var versionGenerator = versionProcessor.requireVersion;
    var processFiles = filterRequireFiles(souceFiles, versionProcessor);
    if (versionGenerator) {
        outputVersionInfo = versionGenerator.call(versionProcessor, processFiles, versionModuleIds);
    }
    else {
        // 生成路径前缀对应的版本号映射信息
        var md5VersionTree = createMd5VersionTree(processFiles, function (processFile) {

            // 不处理版本号要输出的文件
            return (outputFile !== processFile);
        });

        // 基于给定的版本树信息，收集指定的路径深度的版本信息
        outputVersionInfo = collectPathVersion(
            md5VersionTree, versionProcessor.pathPrefixDepth,
            versionProcessor.sourceRootRegExp
        );

        // 只输出指定的模块 id 的版本号信息
        if (versionModuleIds) {
            var result = {};
            versionModuleIds.forEach(function (id) {
                if (outputVersionInfo[id]) {
                    result[id] = outputVersionInfo[id];
                }
                else {
                    console.error('edp build versiong cannot process unknown module id: ' + id);
                }
            });
            outputVersionInfo = result;
        }
    }

    // 处理要输出的版本号信息
    var versionMap = {};
    if (outputFile) {

        // 输出文件版本号信息并更新html文件引用的路径的版本号信息
        outputFile.data = 'require.config({ urlArgs: '
            + stringify(outputVersionInfo) + ' });';
        versionMap[outputFile.path] = util.md5sum(outputFile);
    }
    else if (typeof outputOption === 'function') {

        // 执行回调
        outputOption.call(versionProcessor, outputVersionInfo, processFiles);
    }
    else if (typeof outputOption === 'string'
        && VERSION_PLACEHOLDER_REGEXP.test(outputOption)) {

        // 对输入选项值作为要替换版本号信息的变量
        if (versionProcessor.requireOutputByPage) {
            versionMap[outputOption] = {
                outputByPage: true,
                value: outputVersionInfo
            };
        }
        else {
            versionMap[outputOption] = {value: stringify(outputVersionInfo)};
        }
    }

    // 生成 require 的模块的默认版本号信息，如果需要的话
    var defaultOutput = versionProcessor.requireDefaultOutput;
    if (typeof defaultOutput === 'string' && VERSION_PLACEHOLDER_REGEXP.test(defaultOutput)) {
        versionMap[defaultOutput] = {
            value: edpBuildHelper.getFormatTime()
        };
    }

    return versionMap;
};
