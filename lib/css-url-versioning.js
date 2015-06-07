/**
 * @file 为css url 引用的资源添加版本号信息
 *
 * NOTICE:
 *       对于 `css` 引用的资源如果是以 `http(s):` 协议开头，
 *       会忽略该资源版本号添加
 *
 * @author wuhuiyao
 */

var pathUtil = require('path');
var urlUtil = require('url');
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
 * 为 `css` 引用的 url 资源添加版本号信息
 *
 * @param {Versioning} versionProcessor 版本号处理器
 * @param {Array.<Object>} files 要处理文件信息列表
 * @param {Object=} versionMap 要添加的图片资源版本号信息 map
 */
module.exports = exports = function (versionProcessor, files, versionMap) {
    var cssURL = versionProcessor.cssURL;
    var existedVersionMap;
    var initAllURL;

    if (!cssURL) {
        if (!versionMap || !Object.keys(versionMap).length) {
            return;
        }

        existedVersionMap = versionMap;
    }
    else {
        if (Array.isArray(cssURL)) {
            initAllURL = false;
            existedVersionMap = util.generateFileMD5Info(util.findFileByPath(cssURL, files));
        }
        else {
            initAllURL = true;
            existedVersionMap = {};
        }
    }

    var cssSuffix = versionProcessor.fileSuffix.css;
    var replaceHandler = function (filePath, match, url) {

        // 如果资源 url 为标准的 http(s) url 则不做处理
        if (HTTP_URL.test(url)) {
            return match;
        }

        var processPath = urlUtil.parse(util.normalizePath(
            pathUtil.join(pathUtil.dirname(filePath), url)
        )).path;
        var version = existedVersionMap[processPath];

        if (!version && initAllURL) {
            var foundFile = util.findFileByPath(processPath, files);
            version = foundFile && util.md5sum(foundFile);
            existedVersionMap[processPath] = version;
        }

        if (version) {
            var prefix = url.indexOf('?') > 0 ? '&' : '?';
            return match.replace(url, url + prefix + version);
        }

        return match;
    };

    for (var i = 0, len = files.length; i < len; i++) {
        var file = files[i];
        var extname = file.extname;

        if (util.isFileTypeOf(extname, cssSuffix)) {
            var filePath = file.path;
            file.data = file.data.replace(
                CSS_URL_REGEXP, replaceHandler.bind(this, filePath)
            );
        }
    }
};
