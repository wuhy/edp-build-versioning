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