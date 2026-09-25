import { Test } from '@nestjs/testing';
import { WorkerModule } from './worker.module';
import { WorkerService } from './worker.service';
import { WorkerController } from './worker.controller';
import { CONTAINER_DRIVER } from './container-driver.interface';

describe('WorkerModule', () => {
  it('should compile the module and resolve providers and controllers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    })
      .overrideProvider(CONTAINER_DRIVER)
      .useValue({
        getContainer: jest.fn(),
        createContainer: jest.fn(),
        listContainers: jest.fn().mockResolvedValue([]),
        ping: jest.fn().mockResolvedValue(true),
      })
      .compile();

    const workerService = moduleRef.get<WorkerService>(WorkerService);
    const workerController = moduleRef.get<WorkerController>(WorkerController);

    expect(workerService).toBeDefined();
    expect(workerController).toBeDefined();
  });
});
