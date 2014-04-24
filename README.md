
edp-build-versioning
========

> EDP Build plugin for Resource Versioning

edp-build-versioning 是 [edp-build](https://github.com/ecomfe/edp-build)的一个插件，
用于为 [esl](https://github.com/ecomfe/esl) `require` 的 `JS` 和 `TPL` 资源自动添加MD5
版本号信息，也支持为 `CSS` 文件自动添加MD5版本号信息。

关于edp支持的版本号处理方案及关于 `Versioning` 处理器实现方案一个简单探讨，
参见这个 [Issue] (https://github.com/ecomfe/edp/issues/232)。

## 如何使用

在 `edp-build-config.js` 文件里，添加该处理器：

```javascript
exports.getProcessors = function () {

    var Versioning = require('./tool/Versioning');
    var versionProcessor = new Versioning({
        cssFilePaths: ['src/common/css/main.less'], // 要添加版本号信息的css文件路径
        pathPrefixDepth: 2, // 要生成的路径前缀的版本号信息最大路径前缀深度，为了避免生成
        // 的路径前缀信息较多，理想情况下，每个文件对应的路径都生成，对于项目文件较多，将导致如下
        // 生成版本号信息太多，影响页面加载及 esl require 的效率，因此建议控制下深度值
        output: '\'esl_resource_version\'' // require 资源生成的版本号信息输出地方
    });

    // init EDP Build other processors

    return [
       lessCompiler,
       cssCompressor,
       moduleCompiler,
       tplMerger,
       new JsCompressor(),
       versionProcessor,
       pathMapper
    ];
}
```

在 `require.config` 里配置要输出的版本号信息位置：

```javascript
require.config({
    'baseUrl': 'src',
    'urlArgs': 'esl_resource_version'
    // other config
});
```

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
