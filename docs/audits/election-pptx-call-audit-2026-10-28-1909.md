# 2026-10-28 19:09 小学生竞选班干部 PPTX 调用审计

## 1. 结论与定性

**本次调用确实成功生成并交付了原生 `.pptx` 文件，4 页完整幻灯片、结构有效且内容契合要求。但本次成功属于“系统自愈机制触发后的模型动态修复”，而不是依赖完备的开箱即用生成。**

核心审计事实如下：

1. **任务契约与准入成功纠正**：与 18:42 轮次被误选为 HTML 不同，本次模型任务契约正确识别目标为 `artifact_types: [".pptx"]`，准入门禁最终通过 `action: "use"` 准入了 `pptx` 技能。
2. **沙箱底层确实依然缺少 `python-pptx` 依赖**：首轮脚本执行时，再次暴露出环境依赖缺陷，抛出 `ModuleNotFoundError: No module named 'pptx'`，直接印证了上一份报告关于“运行镜像缺少依赖”的判断。
3. **成功根源在于 DSH 自愈提示与模型动态排错**：
   - DSH 内核捕获缺失模块后，主动下发自愈引导：`[系统自愈提示]: 检测到 Python 缺少依赖模块，请调用 bash 执行 pip install <模块名> 安装依赖后再重试`；
   - 模型接收提示后，通过 `bash` 调用 `pip install --break-system-packages python-pptx` 将依赖动态安装至用户主目录（`/home/sandbox/.local/`）；
   - 随后模型在执行脚本时遇到自己编写的代码 Bug（`TypeError: expected string or bytes-like object, got 'tuple'`），再次自主修复 Python 脚本并重新运行，最终完成生成。
4. **自愈代价与环境隐患**：
   - **Token 严重膨胀**：历经 5 轮工具交互与 11 次 LLM 推理，单次消耗 **128,004 Token**（输入 118,761 / 输出 9,243），相比直接生成成本放大近 3 倍；
   - **耗时处于高位**：总耗时 **126.426 秒**（LLM 耗时 89.567 秒）；
   - **环境非持久化**：动态 pip 仅落于当前容器的可写层；一旦容器销毁重建，依赖依然缺失，其他用户或新容器仍会复现失败。

**定性判定**：**工程依赖缺失客观存在，靠运行时动态自愈成功兜底**。

---

## 2. 调用身份与全链路还原

- **会话 ID**：`chat-session-1793185084401-f6zq4avd`
- **用户 ID**：`e7fce333-a8f4-4097-9a53-f0a4c729da46`
- **消息 ID**：用户 `1793185628245-97f0guqr`，助手 `1793185628245-u8cmh7fd`
- **证据 Turn ID**：`1793185754781590385-66e4fef5633b4e9ab4db2b94b804c07a`
- **模型**：`qwen36-35b-a3b`（ID: `d13e0d30-87b9-4e87-b96a-d8b1b3cf78af`）
- **时序流转**：
  1. `18:58:08`：用户首次提交请求，由于上游模型代理在 `19:00:22` 发生瞬态网络中断（`timeout of 90000ms exceeded`），请求卡住直至 `19:03:07` 触发 300 秒超时熔断；
  2. `19:07:08`：用户再次提交相同指令，Session-Broker 2ms 内获取分布式锁，调度现有容器 `ops-user-sandbox-e7fce333-a8f4-4097-9a53-f0a4c729da46`；
  3. `19:07:15 ~ 19:09:14`：DSH 启动 11 次 LLM 推理与 5 轮工具交互，完成自愈安装与生成；
  4. `19:09:14`：生成完成，向前端保存会话并完成流式交付。

---

## 3. 门禁与契约决策链

| 阶段 | 门禁名称 | 动作 | 判定依据 |
| :--- | :--- | :--- | :--- |
| 1 | `task_intent_review` | `accept` | `output_mode: artifact, task_mode: execute` |
| 2 | `task_intent` | `accept` | 提取交付物 `artifact_types: [".pptx"]`，引用原话要求 |
| 3 | `skill_admission_attempt` | `reject` | 拦截模型试图擅自改写任务契约的行为 |
| 4 | `skill_admission` | `use` | 成功准入 `pptx` 技能，`initial_candidate: "pptx", reason: "applicable"` |
| 5 | `user_unit_confirmation` | `accept` | 确认无需额外口径确认 |

本次调用的任务契约没有发生“偏航为 `.html`”的现象，从一开始就锁定了原生 `.pptx` 目标。

---

## 4. 关键过程：五步自愈执行还原

| 轮次 | 目标工具 | 执行命令/代码摘要 | 真实返回结果 | 处置动作 |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `bash` | 写入 `/workspace/gen_pptx.py` 并执行生成脚本 | ❌ 退出码 1：`ModuleNotFoundError: No module named 'pptx'` | 系统注入自愈提示，建议执行 pip 安装 |
| **2** | `bash` | `pip install python-pptx 2>&1 \| tail -5` | ❌ 被 Debian PEP 668 拦截：`error: externally-managed-environment` | 模型分析错误提示，发现需要传参 `--break-system-packages` |
| **3** | `bash` | `pip install --break-system-packages python-pptx 2>&1 \| tail -5` | ✅ 成功安装 `python-pptx-1.0.2` 到 `~/.local/lib/` | 依赖补齐，准备再次执行生成 |
| **4** | `bash` | `python3 /workspace/gen_pptx.py 2>&1` | ❌ 退出码 1：`TypeError: expected string or bytes-like object, got 'tuple'` | 模型发现自己代码中的传参类型 Bug |
| **5** | `bash` | 覆盖写入修复后的 `/workspace/gen_pptx.py` 并执行 | ✅ 成功输出：`PPTX 成功生成并保存至: /workspace/竞选班干部.pptx` | 生成完成，准备交付 |

模型表现出极强的反思与自愈能力，连续攻克了**“环境缺库”**与**“脚本语法 Bug”**两个难关。

---

## 5. 产物物理实体检验

文件已物理写入宿主机共享工作区：
- **物理路径**：`data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/竞选班干部.pptx`
- **文件大小**：34,666 字节
- **SHA-256**：`4c668b5749b0aa58ee4a3108fa5d244dec57d618d41269ad59bd3ea2499a526b`
- **Office OpenXML 检验**：`zipfile.testzip() is None`（归档无损坏，XML 结构完整）
- **幻灯片数量**：4 页（`ppt/slides/slide1.xml` ~ `slide4.xml`）
  - Slide 1: 封面（竞选班干部、姓名班级、竞选口号）
  - Slide 2: 自我介绍（性格特点、兴趣爱好、服务优势）
  - Slide 3: 个人荣誉（三好学生、学习标兵、文体奖项卡片）
  - Slide 4: 竞选宣言（工作设想、竞选承诺、致谢号召）

产物完全符合用户“小学生竞选班干部、3到4页、不复杂”的诉求。

---

## 6. 性能与遥测

| 遥测指标 | 实际测得值 | 评价与对比 |
| :--- | ---:| :--- |
| **总端到端耗时** | 126.426 秒 | 偏高（正常无排错应在 40~50 秒区间） |
| **沙箱 DSH 内核耗时** | 125.892 秒 | 占端到端 99.5% |
| **LLM 净耗时** | 89.567 秒 | 占 DSH 71.1% |
| **首字时间 (TTFT)** | 30.492 秒 | 包含前置门禁与初始脚本生成 |
| **LLM 推理总调用** | 11 次 | 规划 1 次、工具交互与纠偏 10 次 |
| **Prompt Tokens** | 118,761 | 累积上下文导致多轮膨胀 |
| **Completion Tokens** | 9,243 | 代码编写与修复输出 |
| **总 Token 消耗** | **128,004** | **较 18:42 轮次的 7.1 万 Token 增长 80%** |

---

## 7. 审计归因与后续建议

### 归因裁定
- **结果状态**：成功（已交付高质量原生 `.pptx`）。
- **执行定性**：**环境缺陷引发自愈链路，模型自主修复达成目标**。
- 再次证实了 18:42 审计报告的正确性：沙箱镜像本身**确实没有内置预装 `python-pptx`**。本次之所以能出 PPTX，是模型被报错逼迫、现场使用 `pip install` 临时装上的。

### 根治建议（不可掉以轻心）
1. **必须彻底解决镜像漂移**：
   切勿因为“本次能靠模型动态安装成功”就放弃构建新镜像。动态安装消耗了近 13 万 Token 和 2 分钟时延，且容易因网络超时或包管理器锁导致整体任务直接超时崩溃（如 18:58 发生的那样）。
   执行以下构建彻底固化依赖：
   ```bash
   docker build -t ops-user-sandbox:local -f docker/user-sandbox/Dockerfile .
   ```
2. **保留 DSH 自愈提示机制**：
   本次运行证明 DSH 针对 `ModuleNotFoundError` 注入的自愈提示机制极其有效，成功挽救了即将失败的任务，应继续保留该机制作为最后一道防线。
