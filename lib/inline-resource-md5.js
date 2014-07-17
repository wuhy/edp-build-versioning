/**
 * @file 为内联引用的资源文件生成 md5 版本号信息的处理器
 * @author wuhuiyao
 */

var util = require('./util');

/**
 * 扫描特定的资源类型的文件
 *
 * @param {Array.<Object>} scanFiles 要扫描的文件
 * @param {Array.<string>} resourceSuffixs 要扫描的资源文件的后缀名
 *  @return {Array.<Object>} 扫描到资源文件要添加到的目标数组
 */
function scanResourceFiles(scanFiles, resourceSuffixs) {
    var found = [];

    for (var i = 0, len = scanFiles.length; i < len; i++) {
        var file = scanFiles[i];

        if (util.isFileTypeOf(file.extname, resourceSuffixs)) {
            found.push(file);
        }
    }

    return found;
}

/**
 * 获取要处理的文件对象列表
 *
 * @param {Array.<string>} processFilePaths 要处理的文件路径列表
 * @param {Array.<Object>} sourceFiles 源文件对象列表
 * @return {Array.<Object>}
 */
function getProcessFiles(processFilePaths, sourceFiles) {
    var processFiles = [];

    var sourceLen = sourceFiles.length;
    var file;
    var processPath;
    for (var i = 0, len = processFilePaths.length; i < len; i++) {
        processPath = processFilePaths[i];

        for (var k = 0; k < sourceLen; k++) {
            file = sourceFiles[k];
            if (file.path === processPath) {
                processFiles.push(file);
                break;
            }
        }
    }

    return processFiles;
}

/**
 * 为资源文件生成MD5值作为版本号，返回资源文件路径对应的md5值版本号信息Map
 *
 * @param {Array.<Object>} processFiles 要处理的文件列表
 * @return {Object}
 */
function generateResourceFileVersionInfo(processFiles) {
    if (!processFiles || processFiles.length <= 0) {
        return {};
    }

    var versioningMap = {};
    for (var i = 0, len = processFiles.length; i < len; i++) {
        var fileInfo = processFiles[i];
        versioningMap[fileInfo.outputPath] = util.md5sum(fileInfo);
    }

    return versioningMap;
}

/**
 * 生成JS文件的版本信息
 *
 * @param {Versioning} versionProcessor 版本号处理器
 * @param {Array.<Object>} files 要处理文件信息列表
 */
exports.generateJSFileVersion = function (versionProcessor, files) {
    return generateResourceFileVersionInfo(
        getProcessFiles(versionProcessor.jsFilePaths || [], files)
    );
};

/**
 * 生成CSS文件的版本信息
 *
 * @param {Versioning} versionProcessor 版本号处理器
 * @param {Array.<Object>} files 要处理文件信息列表
 */
exports.generateCSSFileVersion = function (versionProcessor, files) {
    var processCssFiles;

    if (versionProcessor.autoScanCss) {
        processCssFiles = scanResourceFiles(files, versionProcessor.fileSuffix.css);
    }
    else {
        processCssFiles = getProcessFiles(versionProcessor.cssFilePaths || [], files);
    }

    return generateResourceFileVersionInfo(processCssFiles);
};

/**
 * 为图片文件生成版本号信息
 *
 * @param {Versioning} versionProcessor 版本号处理器
 * @param {Array.<Object>} files 要处理文件信息列表
 */
exports.generateImgVersion = function (versionProcessor, files) {
    var processCssFiles;

    if (versionProcessor.autoScanImg) {
        processCssFiles = scanResourceFiles(files, versionProcessor.fileSuffix.img);
    }
    else {
        processCssFiles = getProcessFiles(versionProcessor.imgFilePaths || [], files);
    }

    return generateResourceFileVersionInfo(processCssFiles);
};
