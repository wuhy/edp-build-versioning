
edp-build-versioning
========

> EDP Build plugin for Resource Versioning

edp-build-versioning 是 [edp-build](https://github.com/ecomfe/edp-build)的一个插件，用于为 [esl](https://github.com/ecomfe/esl) `require` 的 `JS` 和 `TPL` 资源自动添加MD5版本号信息，也支持为 `CSS` 、`JS` 、`图片` 内联资源文件自动添加 `MD5版本号` 信息。

**对于图片资源添加版本号信息，目前只处理 `css` 引用的图片资源。**

关于edp支持的版本号处理方案及关于 `Versioning` 处理器实现方案一个简单探讨，参见这个 [Issue] (https://github.com/ecomfe/edp/issues/232)。

## 如何使用

### Install

```shell
npm install edp-build-versioning
```

### Config

1. 在 `edp-build-config.js` 文件里，添加该处理器：

    **注意：** 处理器放的位置，最好放在倒数第二个处理器前，确保计算 `md5` 值能正确反应文件内容变化。
    
    ```javascript
    exports.getProcessors = function () {
    
        var Versioning = require('edp-build-versioning');
        var versionProcessor = new Versioning({
            // 要添加版本号的图片文件路径
            imgFilePaths: ['src/img/sprite.png'],
            // 自动为所有引用的 图片 资源添加版本号信息
            // autoScanImg: true, 
            
            // 要添加版本号的内联js文件路径
            jsFilePaths: ['src/common/a.js'], 
            
            // 要添加版本号信息的内联css文件路径
            cssFilePaths: ['src/common/css/main.less'], 
            // 自动扫描所有css为其引用添加版本号
            // autoScanCss: true, 
            
            // 要生成的路径前缀的版本号信息最大路径前缀深度，为了避免生成
            // 的路径前缀信息较多，理想情况下，每个文件对应的路径都生成，
            // 对于项目文件较多，将导致如下生成版本号信息太多，影响页面
            // 加载及 esl require 的效率，因此建议控制下深度值
            pathPrefixDepth: 2, 
            
            // require 资源生成的版本号信息输出地方
            output: '\'esl_resource_version\'' 
        });
    
        // init EDP Build other processors
    
        return {
        
            // 用于开发调试测试环境，执行 edp build -f 即可
            default: [
                lessCompiler,
                cssCompressor,
                moduleCompiler,
                tplMerger,
                versionProcessor,
                pathMapper
            ],
    
            // 用于线上环境，执行 edp build -f -s release
            release: [
                lessCompiler,
                cssCompressor,
                moduleCompiler,
                tplMerger,
                new JsCompressor(),
                versionProcessor,
                pathMapper
            ]
        };
    }
    ```

2. 在 `require.config` 里配置要输出的版本号信息位置：

    ```javascript
    require.config({
        'baseUrl': 'src',
        'urlArgs': 'esl_resource_version'
        // other config
    });
    ```

### Build

执行 `edp build` 后，`urlArgs` 值会替换成类似如下的值，由于路径深度为 `2` 因此下面最长只会看到
`a/b` 这种前缀的版本号信息：

```javascript
require.config({
    'baseUrl': 'src',
    'urlArgs': {
        '05522e67.tpl': 'v=05522e67adb8b30c',
        'actionConf': 'v=59f0fad74c9c1db4',
        'main': 'v=fe9fa327ea8fbb72',
        'manage/index': 'v=d41d8cd98f00b204'
        // ...
    }
    // other config
});
```

`html` 文件引用的样式文件，自动添加版本号信息

```html
<link href="asset/common/css/main.css?v=7a6f7d07c5570c28" rel="stylesheet" />
```
