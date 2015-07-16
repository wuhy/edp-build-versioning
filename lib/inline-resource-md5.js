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
 * 为图片文件生成版本号信息
 *
 * @param {Versioning} versionProcessor 版本号处理器
 * @param {Array.<Object>} files 要处理文件信息列表
 * @return {Object}
 */
exports.generateImgVersion = function (versionProcessor, files) {
    var processImgFiles;

    if (versionProcessor.autoScanImg) {
        processImgFiles = scanResourceFiles(files, versionProcessor.fileSuffix.img);
    }
    else {
        processImgFiles = util.findFileByPath(versionProcessor.imgFilePaths || [], files);
    }

    return util.generateFileMD5Info(processImgFiles, versionProcessor.md5Length);
};

function addFiles(filePaths, target) {
    for (var i = 0, len = filePaths.length; i < len; i++) {
        var f = filePaths[i];
        if (target.indexOf(f) === -1) {
            target.push(f);
        }
    }
}

/**
 * 获取要处理的 css file
 *
 * @inner
 * @param {Versioning} processor 版本号处理器
 * @param {Array.<Object>} files 源文件信息列表
 * @return {Array.<Object>}
 */
function getProcessCSSFiles(processor, files) {
    var cssFiles;
    if (processor.autoScanCss) {
        cssFiles = scanResourceFiles(files, processor.fileSuffix.css);
    }
    else {
        cssFiles = util.findFileByPath(processor.cssFilePaths || [], files);
    }

    return cssFiles;
}

/**
 * 获取要处理的 file
 *
 * @inner
 * @param {Versioning} processor 版本号处理器
 * @param {Array.<Object>} files 源文件信息列表
 * @return {Array.<Object>}
 */
function getProcessFiles(processor, files) {
    var cssFiles = getProcessCSSFiles(processor, files);
    var jsFiles = util.findFileByPath(processor.jsFilePaths || [], files);
    var processFiles = util.findFileByPath(processor.filePaths || [], files);

    addFiles(jsFiles, processFiles);
    addFiles(cssFiles, processFiles);

    return processFiles;
}

/**
 * 获取内联的资源文件要添加的版本号信息，包括 css, js 及其他指定的内联资源文件
 *
 * @param {Versioning} versionProcessor 版本号处理器
 * @param {Array.<Object>} souceFiles 源文件信息列表
 * @return {Object}
 */
exports.generateInlineFileVersion = function (versionProcessor, souceFiles) {
    var processFiles = getProcessFiles(versionProcessor, souceFiles);
    versionProcessor.processInlineFiles = processFiles;

    var versionMap = util.generateFileMD5Info(processFiles, versionProcessor.md5Length);

    // 对于重写文件路径，改写输出的文件路径及引用的 url
    var renameFile = versionProcessor.rename;
    if (renameFile) {
        processFiles.forEach(function (f) {
            var outputPath = f.outputPath;
            f.outputPaths.push(
                versionProcessor.getRenameFilePath(outputPath, versionMap[outputPath])
            );
        });
    }

    if (renameFile) {
        Object.keys(versionMap).forEach(function (k) {
            var version = versionMap[k];
            versionMap[k] = {
                rename: true,
                value: versionProcessor.getRenameFilePath(k, version)
            };
        });
    }

    return versionMap;
};
