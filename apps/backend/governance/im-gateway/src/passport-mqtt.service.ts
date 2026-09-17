import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as mqtt from 'mqtt';

export interface PassportTaskPayload {
  trace_id: string;
  device_id: string;
  timestamp?: number;
  audio_format?: string;
  audio_base64?: string;
  prompt_text?: string;
}

@Injectable()
export class PassportMqttGatewayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PassportMqttGatewayService.name);
  private client: mqtt.MqttClient | null = null;

  private readonly brokerHost = process.env.PASSPORT_MQTT_HOST || '';
  private readonly brokerPort = parseInt(process.env.PASSPORT_MQTT_PORT || '8883', 10);
  private readonly username = process.env.PASSPORT_MQTT_USER || '';
  private readonly password = process.env.PASSPORT_MQTT_PASS || '';

  onModuleInit() {
    // Legacy prototype stays disabled until it has real identity and execution routing.
    if (process.env.PASSPORT_MQTT_ENABLED === 'true') {
      this.logger.warn('Legacy Passport MQTT remains disabled: simulated completion is unsafe');
    }
  }

  onModuleDestroy() {
    if (this.client) {
      this.logger.log('Closing MQTT gateway client connection');
      this.client.end(true);
    }
  }

  private connect() {
    const brokerUrl = `mqtts://${this.brokerHost}:${this.brokerPort}`;
    this.logger.log(`Connecting to EMQX Gateway Broker at ${brokerUrl} ...`);

    this.client = mqtt.connect(brokerUrl, {
      clientId: `ops_backend_${Math.random().toString(16).slice(2, 8)}`,
      username: this.username,
      password: this.password,
      rejectUnauthorized: true,
      reconnectPeriod: 3000,
      keepalive: 60,
    });

    this.client.on('connect', () => {
      this.logger.log(`✅ Successfully connected to EMQX Gateway (${this.brokerHost}:${this.brokerPort})`);
      // Subscribe to all AI Passport task topics: ops/passport/{device_id}/task
      this.client?.subscribe('ops/passport/+/task', { qos: 1 }, (err) => {
        if (err) {
          this.logger.error('Failed to subscribe to task topic', err);
        } else {
          this.logger.log('Subscribed to task topic: ops/passport/+/task');
        }
      });
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT Client Error: ${err.message}`, err.stack);
    });

    this.client.on('reconnect', () => {
      this.logger.warn('Reconnecting to EMQX Gateway...');
    });

    this.client.on('message', (topic, payload) => {
      void this.handleIncomingMessage(topic, payload);
    });
  }

  private async handleIncomingMessage(topic: string, payload: Buffer) {
    try {
      // topic: ops/passport/{device_id}/task
      const parts = topic.split('/');
      const deviceId = parts[2] || 'unknown';

      const data = JSON.parse(payload.toString('utf-8')) as PassportTaskPayload;
      const traceId = data.trace_id || `trace_${Date.now()}`;

      this.logger.log(`Received task from AI Passport [${deviceId}], traceId: ${traceId}`);

      // 1. Immediately send ACK to terminal
      this.sendAck(deviceId, traceId, '任务已受理，智能体正在执行...');

      // 2. Execute the automation task
      const resultText = await this.dispatchAgentTask(data);

      // The prototype cannot attest to a real execution. Never report success.
      this.sendAck(deviceId, traceId, resultText);
    } catch (err: any) {
      this.logger.error(`Failed to process incoming task: ${err.message}`);
    }
  }

  /**
   * Send immediate acknowledgment to the device
   */
  public sendAck(deviceId: string, traceId: string, speechMessage: string) {
    if (!this.client || !this.client.connected) {
      return;
    }
    const topic = `ops/passport/${deviceId}/ack`;
    const payload = JSON.stringify({
      trace_id: traceId,
      status: 'accepted',
      immediate_speech: speechMessage,
    });
    this.client.publish(topic, payload, { qos: 1 });
  }

  /**
   * Send asynchronous execution result to the device for speech playback
   */
  public sendResult(deviceId: string, traceId: string, summaryText: string, ttsBase64?: string) {
    if (!this.client || !this.client.connected) {
      return;
    }
    const topic = `ops/passport/${deviceId}/result`;
    const payload = JSON.stringify({
      trace_id: traceId,
      status: 'completed',
      text: summaryText,
      summary_text: summaryText,
      tts_audio_base64: ttsBase64,
    });
    this.client.publish(topic, payload, { qos: 1 });
    this.logger.log(`Result sent to AI Passport [${deviceId}], topic: ${topic}`);
  }

  /**
   * Dispatches the task to the ops-automation intelligence orchestrator
   */
  private async dispatchAgentTask(task: PassportTaskPayload): Promise<string> {
    const prompt = task.prompt_text || '系统巡检任务';
    this.logger.log(`Executing ops-automation workflow for: "${prompt}"`);

    // In production, delegate to intelligence orchestrator
    // e.g. await this.aiOrchestrator.dispatch(...)
    return `旧 MQTT 通道未接入真实执行：${prompt}。请使用小智 MCP 渠道。`;
  }
}
