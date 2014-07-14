/**
 * @file require 资源的添加 md5 版本号处理器
 * @author wuhuiyao
 */

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
        if (twins.length == 2) {
            content = twins[0].md5 + twins[1].md5;
            twins[0].optMd5 = twins[1].optMd5 = nodeMd5sum(content);
        }
    }

    return '';
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

/**
 * 初始化通过 `esl` require的资源的版本信息
 *
 * @param {Versioning} versionProcessor 版本号处理器
 * @param {Array.<Object>} files 要处理的文件列表
 * @param {Object} versionMap 存储静态资源要添加/替换的版本号信息，
 *                 key为要替换的值或者要添加版本号信息的路径，value为对应的版本号信息
 */
module.exports = exports = function (versionProcessor, files, versionMap) {

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
            && (util.isSrcJSFile(processFile) || util.isSrcTplFile(processFile));
    });

    // 基于给定的版本树信息，收集指定的路径深度的版本信息
    var pathVersionMap = collectPathVersion(
        md5VersionTree, versionProcessor.pathPrefixDepth
    );

    if (outputFile) {

        // 输出文件版本号信息并更新html文件引用的路径的版本号信息
        outputFile.data = 'require.config({ urlArgs: '
            + JSON.stringify(pathVersionMap) + ' });';
        versionMap[outputFile.path] = util.md5sum(outputFile);
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