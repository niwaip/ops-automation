# Carbone Engine

Fast and powerful report generator - Visual Template Editor Service

## Quick Start

### Docker Deployment

```bash
# 生产模式
docker compose -f docker-compose.carbone.yml up -d

# 开发模式
docker compose -f docker-compose.carbone.yml --profile dev up -d
```

### Local Development

```bash
cd services/carbone-engine
npm install
npm run dev
```

## API Endpoints

| Endpoint                          | Method | Description                                                 |
| --------------------------------- | ------ | ----------------------------------------------------------- |
| `/studio/upload`                  | POST   | Upload template file                                        |
| `/studio/templates`               | GET    | List all templates                                          |
| `/studio/templates/:id`           | GET    | Get template info                                           |
| `/studio/templates/:id/variables` | GET    | Get template variables                                      |
| `/studio/templates/:id/loops`     | GET    | Get loop configurations                                     |
| `/studio/render-resolved`         | POST   | Unified runtime render entry for formal document generation |
| `/studio/preview`                 | POST   | Preview with sample data                                    |
| `/studio/validate`                | POST   | Validate data                                               |
| `/studio/download/:id`            | GET    | Download rendered document                                  |
| `/studio/formatters`              | GET    | Get available formatters                                    |

## Runtime Entry Semantics

- Formal document generation should converge to `/studio/render-resolved`.
- Preview, validate, and template editing flows remain independent from the formal runtime entry.

## Document Domain Role

This service remains physically under `apps/backend/domain/document-engine`, but
its logical ownership has shifted to the future
`apps/backend/capabilities/document-domain`.

### Current Logical Mapping

- `template`: studio template upload, metadata, variable discovery, workflow-assisted authoring
- `render`: preview, validate, and final resolved rendering
- `runtime-facade`: the stable runtime entry around `/studio/render-resolved`

### Document-Domain Alignment

- `document-engine` should be read as the `template / render / runtime-facade`
  side of the future `document-domain`.
- Report-specific task orchestration, analysis, and notifications remain with
  the companion `domain/report` service during the transition.
- New document-domain features should prefer the shared
  `apps/backend/capabilities/document-domain` logical view instead of treating
  this service as a standalone island.

### Out Of Scope

- Report delivery workflows and report-specific export orchestration belong to
  the companion `domain/report` service in the current transition phase.
- Unified release governance should not continue to expand inside this service.

## Template Syntax

### Variables

Use `{d.xxx}` syntax for variables:

```
Hello {d.name}
Total: {d.total:formatNumber(#,##0.00)}
Date: {d.date:formatD(YYYY-MM-DD)}
```

### Arrays / Loops

Use `[i]` and `[i+1]` for array iterations:

```
{d.items[i].name}  - First element
{d.items[i+1].name} - Loop marker
```

### Formatters

Chain formatters with `:`:

```
{d.price:formatNumber:round(2)}
{d.name:upperCase:truncate(20)}
```

## Supported Formats

- Word (.docx)
- Excel (.xlsx)
- PowerPoint (.pptx)
- HTML (.html)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Carbone Studio (可视化编辑器)                                     │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│ │ 上传模板 │ │ 标记变量 │ │ 配置规则 │ │ 预览导出 │              │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Carbone Engine                                                  │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ Parser - 解析 Office Open XML 结构，识别 {d.xxx} 标记       │  │
│ └────────────────────────────────────────────────────────────┘  │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ Builder - 数据绑定，循环处理，生成最终XML                    │  │
│ └────────────────────────────────────────────────────────────┘  │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ Formatter Pipeline - 50+ 内置格式化器，支持链式调用          │  │
│ └────────────────────────────────────────────────────────────┘  │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ File Handler - ZIP文件处理，保存输出                        │  │
│ └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test -- --coverage
```

## License

MIT
