import { UserEmailConnectionService } from '../src/modules/user-connection/user-email-connection.service';

describe('UserEmailConnectionService', () => {
  let service: UserEmailConnectionService;
  let mockPrisma: any;
  let mockCipher: any;

  beforeEach(() => {
    mockPrisma = {
      scopedMemory: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    mockCipher = {
      encrypt: jest.fn((val) => `enc.${val}`),
      decrypt: jest.fn((val) => val.replace('enc.', '')),
    };
    service = new UserEmailConnectionService(mockPrisma, mockCipher);
  });

  it('returns configured: false when no memory exists', async () => {
    mockPrisma.scopedMemory.findUnique.mockResolvedValue(null);
    const res = await service.getConnection('user-1');
    expect(res.configured).toBe(false);
  });

  it('saves user email connection with encrypted password', async () => {
    mockPrisma.scopedMemory.findUnique.mockResolvedValue(null);
    mockPrisma.scopedMemory.upsert.mockResolvedValue({
      updatedAt: new Date('2026-09-02T10:00:00Z'),
    });

    const res = await service.saveConnection('user-1', {
      emailAddress: 'test@qq.com',
      authPassword: 'secret-auth-code',
      smtpHost: 'smtp.qq.com',
      imapHost: 'imap.qq.com',
    });

    expect(res.configured).toBe(true);
    expect(res.emailAddress).toBe('test@qq.com');
    expect(mockCipher.encrypt).toHaveBeenCalledWith('secret-auth-code');
    expect(mockPrisma.scopedMemory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          scopeId: 'user-1',
          valueJson: expect.objectContaining({
            emailAddress: 'test@qq.com',
            encryptedPassword: 'enc.secret-auth-code',
          }),
        }),
      })
    );
  });
});
