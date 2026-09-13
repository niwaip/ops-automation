---
name: image-gen
zh_name: "对话图像创作与编辑引擎"
description: |
  Autonomous AI image generation and multi-turn iterative editing for DeepSeek Harness (dsh). Supports text-to-image, image-to-image, style transfer, and continuous dialogue-based image modifications using system default models.
zh_description: |
  AI 图像创作与多轮连续编辑规范：利用系统默认模型进行文生图与图生图。若系统默认模型为纯文本架构不支持视觉/生图，则主动明确提示不支持，严禁要求用户手动配置第三方 API 密钥。
tags:
  - "image"
  - "image-gen"
  - "ai-drawing"
  - "illustration"
  - "design"
triggers:
  - "画一张"
  - "画图"
  - "生成图片"
  - "生图"
  - "画个"
  - "设计logo"
  - "设计海报"
  - "做个海报"
  - "以图生图"
  - "修改图片"
  - "重绘"
  - "换背景"
  - "文生图"
  - "图生图"
---

# AI 图像生成与多轮编辑规范 (image-gen)

本技能为沙箱环境中的 DeepSeek Harness (`dsh`) 智能体提供对话式图像生成与修图规范。

---

## 1. 核心运行原则

- 🎨 **专属生图模型调度**：系统已在后台配置专门的【文生图模型角色】进行画图创作。当用户提出绘画、画图、生图诉求时，**必须优先调用 `image_gen` 工具**交由底层的生图模型进行渲染。
- ⚠️ **执行结果处理**：
  - 若 `image_gen` 成功生成图片，积极向用户确认并展示生成成果；
  - 若 `image_gen` 报告系统尚未配置文生图模型，引导用户前往平台管理端的「模型配置」添加生图模型并勾选【文生图】默认角色；
  - 若 `image_gen` 因网络波动或上游暂时超时报错，如实告知用户上游生图服务暂时响应异常并建议稍后重试，可同时附上扩写的专业 Prompt。切勿随意宣称系统不支持生图。

---

## 2. 核心工具协议

当用户提出绘画、生图或修图诉求时，通过内置的 `image_gen` 工具调用触发：

```xml
<tool_call>
{
  "name": "image_gen",
  "arguments": {
    "prompt": "详细扩写后的英文或中文提示词",
    "aspect_ratio": "16:9",
    "output_filename": "cyberpunk_cat.png",
    "input_image": "可选：工作区中的已有参考图文件名（用于以图生图/连续修改）",
    "negative_prompt": "可选：负向提示词"
  }
}
</tool_call>
```

### 参数说明：
- `prompt`（必填）：生图提示词。按照专业规范扩写画面主体、环境、光影与艺术风格。
- `aspect_ratio`（选填）：图片比例，默认 `1:1`。可选 `1:1`、`16:9`、`9:16`、`4:3`、`3:4`。
- `output_filename`（选填）：保存到 `/workspace` 的文件名（`.png` 或 `.jpg`）。
- `input_image`（选填）：工作区内已有参考图或待修改图片的文件名。
- `negative_prompt`（选填）：负向提示词。

---

## 3. 多轮连续编辑与修图逻辑

用户提出：“在刚才那张图的基础上加上墨镜”、“把背景改成雪山”：
1. **定位前序图片**：从 `/workspace` 定位上一轮生成的图片；
2. **传入源图引用**：在 `arguments` 中设置 `"input_image": "<原图片名>"`；
3. **调用工具**：若系统默认模型支持视觉/图生图，则执行增量修改；若工具反馈默认模型不支持视觉，直接明确告知用户当前模型不支持。
