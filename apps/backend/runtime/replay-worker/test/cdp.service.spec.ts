import { Test, TestingModule } from '@nestjs/testing';
import { CdpService } from '../src/modules/cdp';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock playwright-core
jest.mock('playwright-core', () => ({
  chromium: {
    connectOverCDP: jest.fn(),
  },
}));

describe('CdpService', () => {
  let service: CdpService;
  let mockBrowser: any;
  let mockContext: any;
  let mockPage: any;

  beforeEach(async () => {
    // Setup mocks
    mockPage = {
      url: jest.fn().mockReturnValue('https://example.com'),
      goto: jest.fn().mockResolvedValue(undefined),
      locator: jest.fn().mockReturnValue({
        click: jest.fn().mockResolvedValue(undefined),
        fill: jest.fn().mockResolvedValue(undefined),
        waitFor: jest.fn().mockResolvedValue(undefined),
        isVisible: jest.fn().mockResolvedValue(true),
        textContent: jest.fn().mockResolvedValue('text'),
        inputValue: jest.fn().mockResolvedValue('value'),
        count: jest.fn().mockResolvedValue(1),
        check: jest.fn().mockResolvedValue(undefined),
        uncheck: jest.fn().mockResolvedValue(undefined),
        selectOption: jest.fn().mockResolvedValue(undefined),
      }),
      getByRole: jest.fn().mockReturnValue({
        click: jest.fn().mockResolvedValue(undefined),
        waitFor: jest.fn().mockResolvedValue(undefined),
      }),
      getByText: jest.fn().mockReturnValue({
        click: jest.fn().mockResolvedValue(undefined),
        waitFor: jest.fn().mockResolvedValue(undefined),
      }),
      getByTestId: jest.fn().mockReturnValue({
        click: jest.fn().mockResolvedValue(undefined),
        waitFor: jest.fn().mockResolvedValue(undefined),
      }),
      evaluate: jest.fn().mockResolvedValue(undefined),
      screenshot: jest.fn().mockResolvedValue(Buffer.from('test')),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
    };

    mockContext = {
      pages: jest.fn().mockReturnValue([mockPage]),
      newPage: jest.fn().mockResolvedValue(mockPage),
    };

    mockBrowser = {
      contexts: jest.fn().mockReturnValue([mockContext]),
      newContext: jest.fn().mockResolvedValue(mockContext),
      close: jest.fn().mockResolvedValue(undefined),
    };

    const playwright = require('playwright-core');
    playwright.chromium.connectOverCDP.mockResolvedValue(mockBrowser);

    const module: TestingModule = await Test.createTestingModule({
      providers: [CdpService],
    }).compile();

    service = module.get<CdpService>(CdpService);
  });

  afterEach(async () => {
    await service.close();
  });

  describe('connect', () => {
    it('TC01: should connect to CDP endpoint successfully', async () => {
      const cdpUrl = 'ws://localhost:9222';
      const state = await service.connect(cdpUrl);

      expect(state.connected).toBe(true);
      expect(state.cdp_url).toBe(cdpUrl);
      expect(state.connected_at).toBeDefined();
    });

    it('should handle connection failure', async () => {
      const playwright = require('playwright-core');
      playwright.chromium.connectOverCDP.mockRejectedValue(new Error('Connection failed'));

      const cdpUrl = 'ws://invalid:9222';

      await expect(service.connect(cdpUrl)).rejects.toThrow('CDP connection failed');
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await service.connect('ws://localhost:9222');
    });

    it('TC02: should execute click action successfully', async () => {
      const locator = { type: 'role' as const, value: 'button' };
      const result = await service.execute('click', locator);

      expect(result.success).toBe(true);
      expect(result.action).toBe('click');
      expect(result.duration_ms).toBeDefined();
    });

    it('should execute fill action with value', async () => {
      const locator = { type: 'css' as const, value: '#input' };
      const result = await service.execute('fill', locator, { value: 'test value' });

      expect(result.success).toBe(true);
      expect(result.action).toBe('fill');
    });

    it('should execute navigate action', async () => {
      const result = await service.execute('navigate', undefined, { url: 'https://example.com' });

      expect(result.success).toBe(true);
      expect(result.action).toBe('navigate');
    });

    it('should fail when locator is missing for click', async () => {
      const result = await service.execute('click', undefined);

      expect(result.success).toBe(false);
      expect(result.error_message).toBeDefined();
    });
  });

  describe('freeze/unfreeze', () => {
    beforeEach(async () => {
      await service.connect('ws://localhost:9222');
    });

    it('should freeze browser input', async () => {
      await service.freeze();
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it('should unfreeze browser input', async () => {
      await service.unfreeze();
      expect(mockPage.evaluate).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close browser connection', async () => {
      await service.connect('ws://localhost:9222');
      await service.close();

      expect(mockBrowser.close).toHaveBeenCalled();
      const state = service.getConnectionState();
      expect(state.connected).toBe(false);
    });
  });

  describe('getConnectionState', () => {
    it('should return disconnected state initially', () => {
      const state = service.getConnectionState();
      expect(state.connected).toBe(false);
      expect(state.cdp_url).toBe('');
    });

    it('should return connected state after connect', async () => {
      await service.connect('ws://localhost:9222');
      const state = service.getConnectionState();
      expect(state.connected).toBe(true);
    });
  });
});
