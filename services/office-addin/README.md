# Carbone Office Add-in

Office Add-in for Carbone template generation with AI assistance.

支持 Word, Excel, PowerPoint。

## 功能特性

- 🤖 **AI 智能识别**: 自动识别文档结构，给出变量替换建议
- ✅ **一键应用**: 批量或单独应用 AI 建议
- 🎯 **手动选择**: 选择特定单元格/元素，自定义变量名
- ⚙️ **模板配置**: 选择模板类型、输出格式、参数配置
- 📝 **自动语法生成**: 根据配置生成 Carbone 标记语法
- 🔍 **格式校验**: 自动校验模板格式正确性

## 开发启动

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## Sideload 测试

```bash
# Word
npm run sideload:word

# Excel
npm run sideload:excel

# PowerPoint
npm run sideload:ppt
```

## 项目结构

```
src/
├── api/
│   └── carbone-api.ts     # 后端 API 对接
├── components/
│   ├── AIIdentifyPanel.tsx # AI 识别面板
│   ├── TemplateConfigPanel.tsx # 模板配置面板
│   └── ManualSelector.tsx # 手动选择组件
├── taskpane/
│   ├── App.tsx           # 主应用
│   ├── store.ts          # 状态管理
│   ├── main.tsx          # 入口
│   └── styles.css        # 样式
└── utils/
    └── office-api.ts     # Office.js API 封装

manifest-word.xml   # Word manifest
manifest-excel.xml  # Excel manifest
manifest-ppt.xml    # PowerPoint manifest
```

## 使用流程

1. 打开 Office 文档
2. 点击 "Carbone" > "模板助手" 打开任务窗格
3. 选择模板类型
4. 点击 "AI 智能识别" 分析文档
5. 查看建议，一键应用或单独应用
6. 配置输出格式
7. 点击 "生成模板" 完成

## 后端服务

需要启动官方 Carbone Docker 服务:

```bash
cd docker/carbone-official
docker-compose up -d
```

后端 API 地址: http://localhost:3100

## Carbone 语法参考

```
# 变量
{d.fieldName}

# 格式化
{d.date:formatDate(YYYY-MM-DD)}
{d.price:formatNumber(#,##0.00)}

# 循环
{#d.items}
  {d.items[i].name}: {d.items[i].price}
{/d.items}

# 条件
{d.field:ifTrue(等于某值):then(显示文本)}
```

## 发布

需要 Microsoft 365 Developer Program 账号。

1. 修改 manifest.xml 中的 URL 为生产环境地址
2. 部署前端静态文件
3. 通过 AppSource 发布