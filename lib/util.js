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
}

/**
 * 判断给定的文件对象是否是Src下的JS文件
 *
 * @param {Object} fileInfo 要check的文件对象
 * @return {boolean}
 */
exports.isSrcJSFile = function (fileInfo) {
    return /^src\//.test(fileInfo.path) && /js/i.test(fileInfo.extname);
}

/**
 * 判断给定的文件对象是否是Src下的Tpl文件
 *
 * @param {Object} fileInfo 要check的文件对象
 * @return {boolean}
 */
exports.isSrcTplFile = function (fileInfo) {
    return /^src\//.test(fileInfo.path) && /html|tpl/i.test(fileInfo.extname);
}

/**
 * 规范化给定的文件路径
 *
 * @param {string} srcPath 路径
 * @return {string}
 */
exports.normalizePath = function (srcPath) {
    return path.normalize(srcPath).replace( /\\/g, '/' );
}