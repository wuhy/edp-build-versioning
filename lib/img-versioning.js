/**
 * @file 为图片资源添加版本号信息
 *
 * NOTICE:
 *       1）当前只处理 `css` 引用的图片资源的版本号信息，
 *       2）对于 `css` 引用的图片资源如果是以 `http(s):` 协议开头，
 *          会忽略该资源版本号添加
 *
 * @author wuhuiyao
 */

var pathUtil = require('path');
var util = require('./util');

/**
 * 用于提取样式中url属性值里包含的链接
 *
 * @type {RegExp}
 * @const
 */
var CSS_URL_REGEXP = /url\s*\(\s*['"]?\s*([^\s'"]*)\s*['"]?\s*\)/g;

/**
 * 简单HTTP URL 正则
 *
 * @type {RegExp}
 * @const
 */
var HTTP_URL = /^https?:/;

/**
 * 为 `css` 引用的图片资源添加版本号信息
 *
 * @param {Versioning} versionProcessor 版本号处理器
 * @param {Array.<Object>} files 要处理文件信息列表
 * @param {Object} 要添加的图片资源版本号信息 map
 */
module.exports = exports = function (verionProcessor, files, versionMap) {
    if (!Object.keys(versionMap).length) {
        return;
    }

    var cssSuffix = verionProcessor.fileSuffix.css;
    var autoScanImg = verionProcessor.autoScanImg;

    for (var i = 0, len = files.length; i < len; i++) {
        var file = files[i];
        var extname = file.extname;

        if (util.isFileTypeOf(extname, cssSuffix)) {
            var filePath = file.path;

            file.data = file.data.replace(CSS_URL_REGEXP, function (match, url) {
                if (HTTP_URL.test(url)) {
                    return match;
                }

                var imgPath = util.normalizePath(
                    pathUtil.join(pathUtil.dirname(filePath), url)
                );

                var version = versionMap[imgPath];
                if (version) {
                    return match.replace(url, url + '?' + version);
                }
                else if (autoScanImg) {
                    console.warn(
                        'Add image file version fail: "%s" in file "%s"',
                        url, filePath
                    );
                }

                return match;
            });
        }
    }
};