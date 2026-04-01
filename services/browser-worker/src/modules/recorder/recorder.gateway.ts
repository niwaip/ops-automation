import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RecorderService } from './recorder.service';

export type RecorderStatus = 'idle' | 'connecting' | 'recording' | 'paused' | 'stopped' | 'error';

interface RecorderState {
  status: RecorderStatus;
  url: string;
  script: string;
  cdpPort?: number;
}

@WebSocketGateway({
  path: '/recorder',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class RecorderGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RecorderGateway.name);
  private recorderStates: Map<string, RecorderState> = new Map();

  constructor(private readonly recorderService: RecorderService) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
    this.recorderStates.set(client.id, {
      status: 'idle',
      url: '',
      script: '',
    });

    // Send initial status
    client.emit('STATUS', { status: 'idle' });
  }

  async handleDisconnect(client: Socket): Promise<void> {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Stop any running browser
    await this.recorderService.stopBrowser(client.id);
    this.recorderStates.delete(client.id);
  }

  @SubscribeMessage('START')
  async handleStart(client: Socket, payload: { url: string }): Promise<void> {
    this.logger.log(`Start recording: ${payload.url}`);

    const state = this.recorderStates.get(client.id);
    if (!state) return;

    state.status = 'connecting';
    state.url = payload.url;
    client.emit('STATUS', { status: 'connecting', url: payload.url });

    try {
      // Start actual browser
      const { cdpPort } = await this.recorderService.startBrowser(client.id, payload.url);

      state.status = 'recording';
      state.cdpPort = cdpPort;

      // Emit status update
      client.emit('STATUS', { status: 'recording', url: payload.url, cdpPort });

      // Get generated script
      const session = this.recorderService.getSession(client.id);
      if (session) {
        client.emit('SCRIPT_UPDATE', { script: session.script });
      }

      this.logger.log(`Browser started on CDP port ${cdpPort}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to start browser: ${errorMessage}`);
      state.status = 'error';
      client.emit('ERROR', { message: `Failed to start browser: ${errorMessage}` });
      client.emit('STATUS', { status: 'error' });
    }
  }

  @SubscribeMessage('STOP')
  async handleStop(client: Socket): Promise<void> {
    this.logger.log(`Stop recording: ${client.id}`);

    const state = this.recorderStates.get(client.id);
    if (!state) return;

    try {
      await this.recorderService.stopBrowser(client.id);
      state.status = 'stopped';

      // Get final script
      const session = this.recorderService.getSession(client.id);
      if (session) {
        client.emit('SCRIPT_UPDATE', { script: session.script });
      }

      client.emit('STATUS', { status: 'stopped' });
    } catch (error) {
      this.logger.error('Error stopping browser:', error);
      client.emit('STATUS', { status: 'stopped' });
    }
  }

  @SubscribeMessage('PAUSE')
  handlePause(client: Socket): void {
    this.logger.log(`Pause recording: ${client.id}`);

    const state = this.recorderStates.get(client.id);
    if (state) {
      state.status = 'paused';
    }

    client.emit('STATUS', { status: 'paused' });
  }

  @SubscribeMessage('RESUME')
  handleResume(client: Socket): void {
    this.logger.log(`Resume recording: ${client.id}`);

    const state = this.recorderStates.get(client.id);
    if (state) {
      state.status = 'recording';
    }

    client.emit('STATUS', { status: 'recording' });
  }
}