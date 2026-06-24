import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
export class RecorderGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RecorderGateway.name);
  private recorderStates: Map<string, RecorderState> = new Map();
  private clientSessions: Map<string, string> = new Map(); // clientId -> sessionId

  constructor(
    private readonly recorderService: RecorderService,
    private eventEmitter: EventEmitter2
  ) {}

  onModuleInit() {
    // Listen for script updates from the service
    this.eventEmitter.on('script.updated', ({ sessionId, script }) => {
      // Find the client for this session
      const clientId = this.clientSessions.get(sessionId);
      if (clientId) {
        const client = this.server.sockets.sockets.get(clientId);
        if (client) {
          client.emit('SCRIPT_UPDATE', { script });
          this.logger.log(`Sent script update to client ${clientId}: ${script.length} chars`);
        }
      }
    });
  }

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
    this.clientSessions.delete(client.id);
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

      // Store client-session mapping for event routing
      this.clientSessions.set(client.id, client.id);

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
      // Get session before stopping (stopBrowser deletes the session)
      const sessionBeforeStop = this.recorderService.getSession(client.id);

      // Stop the browser and get the final script
      await this.recorderService.stopBrowser(client.id);

      state.status = 'stopped';

      // Use the script from session before it was deleted
      if (sessionBeforeStop && sessionBeforeStop.script) {
        state.script = sessionBeforeStop.script;
        client.emit('SCRIPT_UPDATE', { script: sessionBeforeStop.script });
        this.logger.log(`Sent final script: ${sessionBeforeStop.script.length} chars`);
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
