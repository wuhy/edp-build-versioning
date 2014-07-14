/**
 * @file 为内联应用的资源文件添加 md5 版本号的处理器
 * @author wuhuiyao
 */

var fs = require('fs');
var path = require('path');
var util = require('./util');

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
            var filePath = util.normalizePath(dir + '/' + item);
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

// ============= CSS/JS inline file MD5 Versioning ============== //

/**
 * 为css/js等内联的资源文件生成MD5值作为版本号，返回资源文件路径对应的md5值版本号信息Map
 *
 * @param {Array} files 要处理的文件信息数组
 * @return {Object}
 */
function inlineFileVersioning(processFiles, files) {
    if (!processFiles || processFiles.length <= 0) {
        return {};
    }

    var isMatch = function (fileInfo) {
        for (var i = 0, len = processFiles.length; i < len; i++) {
            if (processFiles[i] === fileInfo.path) {
                return true;
            }
        }

        return false;
    };

    var versioningMap = {};
    for (var i = 0, len = files.length; i < len; i++) {
        var fileInfo = files[i];

        // 为匹配到资源文件生成md5值作为版本号
        if (isMatch(fileInfo)) {
            // 缓存生成的md5
            versioningMap[fileInfo.outputPath] = util.md5sum(fileInfo);
        }
    }

    return versioningMap;
}

/**
 * 初始化JS文件的版本信息
 *
 * @param {Versioning} versionProcessor 版本号处理器
 * @param {Array.<Object>} files 要处理的文件列表
 * @param {Object} versionMap 存储静态资源要添加/替换的版本号信息，
 *                 key为要替换的值或者要添加版本号信息的路径，value为对应的版本号信息
 */
exports.initJSFileVersionInfo = function (versionProcessor, files, versionMap) {
    var jsVersionMap = inlineFileVersioning(versionProcessor.jsFilePaths, files);
    for (var k in jsVersionMap) {
        // 由于初始化 js md5值是走的nodeMd5sum，这里取 16 位就行了
        versionMap[k] = jsVersionMap[k].slice(0, 16);
    }
}

/**
 * 初始化CSS文件的版本信息
 *
 * @param {Versioning} versionProcessor 版本号处理器
 * @param {Array.<Object>} files 要处理的文件列表
 * @param {Object} versionMap 存储静态资源要添加/替换的版本号信息，
 *                 key为要替换的值或者要添加版本号信息的路径，value为对应的版本号信息
 */
exports.initCSSFileVersionInfo = function (versionProcessor, files, versionMap) {

    // 扫描要添加css文件版本号的css文件路径
    versionProcessor.cssFilePaths || (versionProcessor.cssFilePaths = []);
    scanCssFilePaths(
            versionProcessor.cssDirs || [],
        versionProcessor.cssFilePaths,
        versionProcessor.cssSuffixs
    );

    // 为css文件生成md5值作为版本号
    var cssVersionMap = inlineFileVersioning(versionProcessor.cssFilePaths, files);
    for (var k in cssVersionMap) {
        versionMap[k] = cssVersionMap[k];
    }
}
