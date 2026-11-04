# AI Passport 配对与电脑伴随桥接

## 在页面配对

1. 在电脑 Chrome / Edge 打开用户端“小智语音 / AI Passport”。
2. 使用 HTTPS，或在运行前端的电脑上打开 `http://localhost:5174`。普通 HTTP 局域网地址不能使用网页蓝牙。
3. 打开设备的蓝牙配对页。在新增“AI Passport 蓝牙配对”卡片点击“扫描并连接设备”，在浏览器选择器中选择 `Folo-PSP` / `FoloPassport-DSH`。
4. 输入设备屏幕上的六位配对码，点击“确认配对”。只有设备返回配对凭据，且凭据被设备再次验证后，页面才显示已配对。
5. 页面支持断开、重新连接、解除/重置设备配对。设备掉线或心跳超时会清除在线状态。

扫描默认按服务 UUID 或完整名/短名匹配，兼容仅名字广播。仍找不到时，点击“找不到设备？显示所有设备”，
检查是否显示短名或未知设备；选择后仍会校验真实 GATT 服务。关闭 DSH 等程序的设备连接并重启设备后再试。
如果能看到设备但提示缺少服务，说明设备固件不兼容，不能通过改名完成配对。

需要设备支持上游 DSH Passport 自定义 GATT 协议 v1。普通小智固件和本仓库的 BLE 占位固件不能响应该协议；本次没有替用户烧录或修改设备固件。
配对入口与 MCP 连接分别显示状态，不要求先配置小智 MCP 即可进行蓝牙配对。
配对后支持设备录音直接进入网页聊天，不经过小智 MCP。设备审批与云端设备所有权绑定尚未接通。
站内切换页面保持蓝牙连接，关闭标签页或刷新网页后需要重新连接。信任凭据按登录账户和浏览器设备 ID 隔离，保存在当前标签页的 sessionStorage；同标签页刷新后点击扫描可复用凭据。
切换账户会关闭现有连接。关闭标签页导致凭据丢失时，需要根据设备屏幕重新配对；必要时点击“重置设备配对”。

协议依据上游仓库提交 `3b2daee4e213c60be1b1460a75ec34778607bd2c`，UUID 与帧格式在前端独立适配，许可见 `UPSTREAM-LICENSE.txt`。
此应用层信任协议不是 BLE 加密认证；设备配对码与信任 token 按上游协议在 BLE 上传输。平台登录令牌不传给设备。

## 蓝牙语音直接发到聊天

配对后按住设备录音键说话，松开结束。页面订阅 VOICE 通知特征，按录音 sessionId 收集原始分片，
使用设备专用 ADPCM 步长表解码为单声道 PCM WAV。序号缺片或样本数与设备时长不符时拒绝转写。
随后复用 `/api/ai/chat/audio/transcriptions`（需要平台配置默认音频转写模型），
识别完成会打开网页聊天窗口，交给与键盘发送相同的聊天发送函数，不调用小智 MCP、DSH 或 xiaozhi 任务接口。
单次录音上限 30 秒，低于 0.5 秒视为误触。此实现的识别位置由平台模型配置决定，不保证离线识别。

默认直接发送整段识别文字；设备结果卡显示精简预览。重复的录音结束和设备“发送”通知不会重复提交。
聊天忙碌时消息最多排队两分钟；提交目标为识别结束时的当前聊天会话，没有会话时由聊天窗口建立。
目标会话变化、账户切换或蓝牙断开会取消待发送消息。现有输入框草稿会保留。
识别文字保留在配对卡片“最近识别”中便于失败后复制重试；“已提交到聊天窗口”不代表模型任务执行完成。
网页转写失败时页面和设备显示错误，不会自动绕回小智云端。

### AI 回复回传

设备消息在聊天发送时关联到本轮实际助手消息 ID；只回传这轮的状态与回复，不发送其他网页会话的内容。
通过固件 v1 已支持的 `task.state` 和 `toast` 下发处理中、回复完成、失败、停止、待审批或待补充输入提示。
处理中流片不会频繁刷设备；回复完成后发送摘要。后台任务仍在运行时不会误报完成。
每条下行控制消息等待对应 msgId 的设备 ACK，超时重试一次，仍未确认则在网页提示回传失败。
设备录音期间延迟下发，避免固件直接忽略状态。断线、解除配对或切换账户后清除旧回复关联。

当前固件 `task.state.title` 缓冲为 64 字节、`toast.text` 为 80 字节；因此分别按 UTF-8 安全截断到
60 / 75 字节，并过滤 Markdown、推理标签和链接。设备显示的是摘要，全文请看聊天窗口。
此链路不包含语音合成/朗读，也不支持在设备直接批准网页审批。
自动直发的识别结果不携带 resultId，不弹出等待按键确认的识别结果卡，避免覆盖 AI 回复状态。

### 硅基流动 ASR 配置

服务商基础地址使用 `https://api.siliconflow.cn/v1`，模型标识填写
`XingChenAGI/XingChenASR-V3.2`，勾选默认范围“语音识别”。
模型编辑页的“语音转写 URL 覆盖”可留空，系统自动使用
`https://api.siliconflow.cn/v1/audio/transcriptions`；也可以在覆盖字段填写此完整地址。
覆盖仅对该模型的转写请求生效，API Key 继续复用服务商配置。不要把基础地址改为聊天接口。
已填写完整转写地址的历史配置也会直接使用，避免重复追加路径。
官方接口文档：https://api-docs.siliconflow.cn/docs/api/audio-transcriptions-post

## JSONL 桥接

借鉴 dsh-ai-passport-plugin 的设备/主机/任务适配分层，首先接入 ops 已有语音任务队列。
JSONL 桥接为独立代码。蓝牙适配遵循上游公开协议并保留许可。上游参考：
https://github.com/slinxiaosun-blip/dsh-ai-passport-plugin

当前交付的是 JSONL → 已登录用户任务接口适配器，不是 BLE 驱动，不兼容性承诺上游固件。
需要先在网页“小智语音 / AI Passport”中绑定并启用小智连接，且 xiaozhi-connector
工作进程正常运行。任务仍由该进程领取；不依赖电脑桥接进程持续在线来执行。
JSONL 桥接尚不支持独立于小智的任务绑定、录音识别、设备审批和主动 BLE 提醒。网页配对由浏览器直接连接，不通过此 JSONL 程序。

## 运行

Node >= 20，无新增 npm 依赖。从仓库根目录运行：

```sh
export OPS_API_URL='http://127.0.0.1:3001' # 按实际 platform 入口修改
read -s OPS_ACCESS_TOKEN
export OPS_ACCESS_TOKEN
node scripts/ai-passport/bridge.mjs
```

令牌使用平台登录获得的 Bearer 访问令牌，不使用小智 MCP URL 中的 token。
远程 API 必须使用 HTTPS；不跟随重定向，防止令牌转发。
输入每行一个 JSON，输出每行一个结果：

```json
{"type":"task.submit","instruction":"检查服务状态","idempotencyKey":"passport-session-0001"}
{"type":"task.list"}
{"type":"task.get","request_id":"从提交结果复制真实 UUID"}
```

提交返回 accepted 仅表示入队，不能当作执行成功。保留 request_id 查询结果。
提交超时后应使用同一个 idempotencyKey 重试，不自动生成新键；不同任务使用不同键。
当前沿用语音任务的限流、去重、用户权限、执行记录核验；审批和补充输入仍在网页处理。

## 接口

下列为网页代理路径；直连 platform 时去掉 `/api`。默认直连端口为 3001。

- `POST /api/im-channels/xiaozhi/tasks`：instruction、idempotencyKey。
- `GET /api/im-channels/xiaozhi/tasks/:requestId`：限定当前用户绑定连接。
- `GET /api/im-channels/xiaozhi/tasks`：当前用户最近任务。

未来设备任务适配层应解码设备帧后调用此适配器，并将返回结果编码成设备帧；
不得将平台令牌发送到设备。现有固件的 BLE SendAudio/SendText 仍是占位实现，
需要核对上游 GATT UUID、握手、分片与音频编码后单独实现和真机验收。

## 验证

```sh
node --test scripts/ai-passport/bridge.test.mjs
pnpm --filter @ops/user-web exec vitest run src/features/im-channels/lib/passport-bluetooth.test.ts
pnpm --filter @ops/user-web typecheck
pnpm --filter @ops/im-gateway typecheck
pnpm --filter @ops/platform exec jest --runInBand xiaozhi-channel.test.ts
```

后端修改需要通过根目录 `./docker/start-smart.sh` 重启 platform 并验证接口；
不要把本地单测通过视为容器已更新或硬件联调通过。
