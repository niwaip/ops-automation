import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export type RecorderStatus = 'idle' | 'connecting' | 'recording' | 'paused' | 'stopped' | 'error';

interface RecorderState {
  status: RecorderStatus;
  url: string;
  script: string;
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

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.recorderStates.delete(client.id);
  }

  @SubscribeMessage('START')
  handleStart(client: Socket, payload: { url: string }): void {
    this.logger.log(`Start recording: ${payload.url}`);

    const state = this.recorderStates.get(client.id);
    if (state) {
      state.status = 'recording';
      state.url = payload.url;
      state.script = '';
    }

    // Emit status update
    client.emit('STATUS', { status: 'recording', url: payload.url });

    // Simulate script generation (in real implementation, this would come from Playwright codegen)
    const mockScript = `// Recording started for: ${payload.url}
// Navigate to the URL
await page.goto('${payload.url}');

// Your recorded actions will appear here
`;

    client.emit('SCRIPT_UPDATE', { script: mockScript });
  }

  @SubscribeMessage('STOP')
  handleStop(client: Socket): void {
    this.logger.log(`Stop recording: ${client.id}`);

    const state = this.recorderStates.get(client.id);
    if (state) {
      state.status = 'stopped';
    }

    client.emit('STATUS', { status: 'stopped' });
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