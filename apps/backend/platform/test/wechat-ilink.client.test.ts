import { WechatIlinkClient } from '@ops/im-gateway';

describe('WechatIlinkClient', () => {
  afterEach(() => jest.restoreAllMocks());
  it('rejects an untrusted QR destination', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({ qrcode: 'token', qrcode_img_content: 'https://attacker.example/qr' }),
      } as Response);
    await expect(new WechatIlinkClient().beginLogin()).rejects.toThrow('不受信任');
  });

  it('uses the iLink message lifecycle endpoint when starting', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ret: 0 }),
    } as Response);

    await new WechatIlinkClient().notifyStart('https://ilinkai.weixin.qq.com/', 'token');

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/ilink/bot/msg/notifystart');
  });

  it('sends context_token in sendText payload when provided', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ret: 0 }),
    } as Response);

    await new WechatIlinkClient().sendText(
      'https://ilinkai.weixin.qq.com/',
      'token',
      'user_123',
      '测试消息',
      'ctx_token_abc'
    );

    expect(fetchMock).toHaveBeenCalled();
    const sentBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(sentBody.msg.context_token).toBe('ctx_token_abc');
  });

  it('throws when sendText receives non-zero ret from iLink', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ret: -2, errmsg: 'session expired' }),
    } as Response);

    await expect(
      new WechatIlinkClient().sendText(
        'https://ilinkai.weixin.qq.com/',
        'token',
        'user_123',
        '测试消息'
      )
    ).rejects.toThrow('ret: -2');
  });
});
