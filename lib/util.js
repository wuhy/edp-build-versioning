/**
 * @file 一些工具方法
 * @author wuhuiyao
 */

var path = require('path');
var crypto = require('crypto');

/**
 * 对FileInfo对象进行md5sum
 *
 * @param {FileInfo|string} file 文件信息对象或者要计算md5sum的内容
 * @param {number=} start 要截取的md5值，开始索引，默认0，可选
 * @param {number=} end 要截取的md5值，结束索引，默认 16，可选
 * @return {string}
 */
exports.md5sum = function (file, start, end) {
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
};

/**
 * 给定的文件是否是给定的扩展名类型的文件
 *
 * @param {string} fileExtName 文件扩展名
 * @param {Array.<string>} fileTypeExtNames 文件扩展名称列表，全小写
 * @return {boolean}
 */
exports.isFileTypeOf = function (fileExtName, fileTypeExtNames) {
    return fileTypeExtNames.indexOf(fileExtName.toLowerCase()) !== -1;
};

/**
 * 规范化给定的文件路径
 *
 * @param {string} srcPath 路径
 * @return {string}
 */
exports.normalizePath = function (srcPath) {
    return path.normalize(srcPath).replace( /\\/g, '/' );
};

/**
 * 移除文件路径的后缀名
 *
 * @param {string} path 给定的文件路径
 * @return {string}
 */
exports.removePathExtName = function (path) {
    return path.replace(/\.([^\.\/\\]*)$/, '');
};

/**
 * 混合目标和源对象
 *
 * @param {Object} target 要 mix 的目标对象
 * @param {...Object} source 用于混合的源对象
 * @return {Object}
 */
exports.mixin = function (target) {
    for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];

        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key];
            }
        }
    }

    return target;
};

/**
 * 获取给定文件路径的扩展名称
 *
 * @param  {string} filePath 文件路径
 * @return {string}
 */
exports.getFileExtName = function (filePath) {
    var lastDotIdx = filePath.lastIndexOf('.');

    if (lastDotIdx >= 0) {
        return filePath.substr(lastDotIdx + 1);
    }
    else {
        return '';
    }
};

/**
 * 查找给定的文件路径的文件对象
 *
 * @param {string|Array.<string>} findFilePaths 要查找的文件路径
 * @param {Array.<Object>} sourceFiles 源文件对象列表
 * @return {?Array.<Object>|?Object}
 */
exports.findFileByPath = function (findFilePaths, sourceFiles) {
    var isArr = Array.isArray(findFilePaths);
    if (!isArr) {
        findFilePaths = [findFilePaths];
    }

    var foundFiles = [];

    var sourceLen = sourceFiles.length;
    var file;
    var findPath;
    for (var i = 0, len = findFilePaths.length; i < len; i++) {
        findPath = findFilePaths[i];

        for (var k = 0; k < sourceLen; k++) {
            file = sourceFiles[k];
            if (file.path === findPath) {
                foundFiles.push(file);
                break;
            }
        }
    }

    return isArr ? foundFiles : foundFiles[0];
};

/**
 * 为资源文件生成MD5值作为版本号，返回资源文件路径对应的md5值版本号信息Map
 *
 * @param {Array.<Object>} processFiles 要处理的文件列表
 * @return {Object}
 */
exports.generateFileMD5Info = function (processFiles) {
    if (!processFiles || !processFiles.length) {
        return {};
    }

    var versioningMap = {};
    for (var i = 0, len = processFiles.length; i < len; i++) {
        var fileInfo = processFiles[i];
        versioningMap[fileInfo.outputPath] = exports.md5sum(fileInfo);
    }

    return versioningMap;
};

/**
 * 判断给定的文件是否满足给定的资源类型
 *
 * @param {Object} file 文件对象
 * @param {Array.<string>} resTypes 资源类型，e.g, ['js', 'tpl']
 * @param {Object} fileSuffix 资源类型的文件后缀定义，key 为资源类型，value为对应该资源类型
 *                 的文件的后缀名，e.g., { 'css': ['less', 'css'] }
 * @return {boolean}
 */
exports.isFileTypeMatch = function (file, resTypes, fileSuffix) {
    var extname = file.extname;

    for (var i = 0, len = resTypes.length; i < len; i++) {
        if (exports.isFileTypeOf(
            extname, fileSuffix[resTypes[i].toLowerCase()] || [])
            ) {
            return true;
        }
    }

    return false;
};
