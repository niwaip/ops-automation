import { ApiProperty } from '@nestjs/swagger';

export class WorkerEndpointsDto {
  @ApiProperty({ example: 'http://localhost:8080', description: 'noVNC endpoint URL' })
  novnc!: string;

  @ApiProperty({ example: 'http://localhost:9222', description: 'Chrome DevTools Protocol endpoint URL' })
  cdp!: string;

  @ApiProperty({ example: 'vnc://localhost:5900', description: 'VNC endpoint URL', required: false })
  vnc?: string;
}

export class CreateWorkerRequestDto {
  @ApiProperty({ example: 'user-123', description: 'User ID for the worker' })
  user_id!: string;

  @ApiProperty({ example: '/profiles/user-123/chrome', description: 'Chrome profile path', required: false })
  profile_path?: string;

  @ApiProperty({ example: 'https://example.com', description: 'Initial URL to navigate to', required: false })
  initial_url?: string;
}

export class CreateWorkerResponseDto {
  @ApiProperty({ example: 'worker-uuid-123', description: 'Created worker ID' })
  worker_id!: string;

  @ApiProperty({ type: WorkerEndpointsDto, description: 'Worker endpoints' })
  endpoints!: WorkerEndpointsDto;
}

export class WorkerStatusDto {
  @ApiProperty({ example: 'worker-uuid-123', description: 'Worker ID' })
  worker_id!: string;

  @ApiProperty({ example: 'user-123', description: 'User ID' })
  user_id!: string;

  @ApiProperty({ example: 'running', enum: ['starting', 'running', 'stopping', 'stopped', 'error'], description: 'Worker status' })
  status!: string;

  @ApiProperty({ type: WorkerEndpointsDto, description: 'Worker endpoints' })
  endpoints!: WorkerEndpointsDto;

  @ApiProperty({ example: '/profiles/user-123/chrome', description: 'Chrome profile path' })
  profile_path!: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Creation timestamp' })
  created_at!: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Last update timestamp' })
  updated_at!: Date;
}

export class HealthCheckResponseDto {
  @ApiProperty({ example: true, description: 'Worker health status' })
  healthy!: boolean;

  @ApiProperty({ example: true, description: 'Chrome process running status' })
  chrome_running!: boolean;

  @ApiProperty({ example: 9222, description: 'CDP port number' })
  cdp_port!: number;

  @ApiProperty({ example: 8080, description: 'noVNC port number' })
  novnc_port!: number;
}

export class SystemHealthResponseDto {
  @ApiProperty({ example: 'ok', description: 'System health status' })
  status!: string;

  @ApiProperty({ example: 5, description: 'Number of healthy workers' })
  workers!: number;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Check timestamp' })
  timestamp!: Date;
}