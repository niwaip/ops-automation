# AI Passport 随身语音任务终端 (ai-passport-agent)

面向 **Folo AI Passport (ESP32-C3 工牌)** 的 AI 自动化随身语音任务终端固件。

本终端旨在**替代手机微信**作为调用云端 AI 智能体与自动化运维工作流的物理入口。用户无需掏出手机解锁打字，直接长按工牌按键说出任务，云端 Agent 执行完毕后，工牌主动唤醒并语音播报执行结果。

---

## 核心特性

- **PTT 任务对讲（Push-to-Talk）**：长按确认键说出任务，松开立即提交并接收即时受理 ACK；
- **异步任务主动播报**：任务在云端异步调度执行（耗时数秒到数分钟），完成后由网关主动推送到终端唤醒屏幕并进行 TTS 语音播报；
- **双通道网络接入**：
  - **Wi-Fi 直连模式**：用于工位/家庭等固定场景，基于 WebSocket / MQTT 直连后台长连接；
  - **手机 BLE 伴随模式**：用于随身出行等无固定 Wi-Fi 场景，通过轻量级 NimBLE GATT 连通手机伴随端（微信小程序），手机充当透明数据中继网关；
- **硬件极限优化**：针对 ESP32-C3 无外部 PSRAM 约束，深度精简网络缓冲区，使用 Opus 流式分片编解码，确保极小内存占用与长期高稳定性。

---

## 硬件规格与引脚连接

| 硬件外设 | 引脚 / 参数 | 说明 |
| :--- | :--- | :--- |
| **主控芯片** | ESP32-C3 | 单核 RISC-V 160MHz，8MB Flash，无 PSRAM |
| **显示屏** | 240 × 320 ST7789P3 | SPI2 (MOSI: `GPIO9`, SCLK: `GPIO8`, CS: `GPIO1`, DC: `GPIO20`) |
| **背光控制** | `GPIO21` | LEDC PWM 调光与休眠控制 |
| **音频编解码** | ES8311 | I2C (SDA: `GPIO10`, SCL: `GPIO7`), I2S (MCLK: `GPIO6`, BCLK: `GPIO5`, WS: `GPIO3`, DOUT: `GPIO2`, DIN: `GPIO4`) |
| **实体按键** | `GPIO0` (ADC1_CH0) | 电阻梯分压三键：上键（音量+）、下键（音量-）、确认键（PTT任务对讲） |
| **原生串口** | `GPIO18` / `GPIO19` | 内置 USB Serial/JTAG 烧录与调试 |

---

## 按键交互指南

- **确认键（中间键）**：
  - **长按（按住不放）**：开始录制语音任务（PTT 模式，屏幕提示“正在倾听任务...”）；
  - **松开按键**：完成录制并提交至云端 Agent，随即收到即时 ACK 并进入任务等待状态；
  - **短按（点击）**：唤醒屏幕；若当前正在播报语音，短按可中止/跳过播放；
  - **开机启动阶段长按**：进入 AP 配网模式。
- **上键**：音量 `+10` / 任务列表上翻。
- **下键**：音量 `-10` / 任务列表下翻。

---

## 固件构建与烧录

### 1. 构建
推荐使用 ESP-IDF 6.0.2 或 5.5.3：

```bash
python scripts/build.py folo/ai-passport-c3 \
  --name folo-ai-passport-c3 \
  --language zh-CN \
  --wake-word nihaoxiaozhi
```

构建成功后，全量 8 MB 合并固件产物位于 `build/merged-binary.bin`。

### 2. 烧录
将工牌通过 USB-C 数据线连接至电脑，将 `PORT` 替换为真实串口：

```bash
python -m esptool --chip esp32c3 --port PORT --baud 460800 \
  write_flash --flash_mode dio --flash_freq 80m --flash_size 8MB \
  0x0 build/merged-binary.bin
```

也可以通过 AI Passport 官方 Web 刷机工具（`/tools/web-flasher/`）在 Chrome / Edge 浏览器中直接免驱动上传 `merged-binary.bin`。

---

## 目录结构

- `main/boards/folo/ai-passport-c3/`：工牌专属引脚、屏驱与 PTT 按键逻辑
- `main/protocols/`：双通道协议（`websocket_protocol`、`ble_gateway_protocol`、`protocol_router`）
- `main/audio/`：ES8311 驱动与 Opus 实时编解码服务
- `main/display/`：ST7789P3 屏幕卡片与状态渲染
- `scripts/build.py`：标准固件打包入口
- `partitions/v2/8m.csv`：8MB Flash 分区表

---

## 许可证
本项目继承原项目 [MIT License](LICENSE)，发布衍生版本时请保留 `LICENSE` 与 `NOTICE`。
