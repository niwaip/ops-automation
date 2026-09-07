import { WechatIlinkClient } from '../src/modules/im-channel/wechat-ilink.client';

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
});
