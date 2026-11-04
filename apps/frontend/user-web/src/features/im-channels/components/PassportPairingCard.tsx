import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Input, Space, Steps, Tag, Typography } from 'antd';
import { useChatStore } from '@/features/chat/chatStore';
import { usePassportSession } from './PassportProvider';

const STATUS = {
  disconnected: '未连接', scanning: '选择设备中', connecting: '正在连接',
  pairing_required: '等待配对码', pairing: '正在验证', paired: '设备已配对', error: '连接失败',
};

export default function PassportPairingCard() {
  const session = usePassportSession();
  return session ? <PassportPairingSession /> : null;
}

export function PassportPairingSession() {
  const { modal } = App.useApp();
  const session = usePassportSession()!;
  const { state, client, voiceStatus, voiceError, transcript, bluetoothAvailable } = session;
  const [code, setCode] = useState('');
  const secure = window.isSecureContext;
  useEffect(() => { if (state.status === 'paired' || state.status === 'disconnected') setCode(''); }, [state.status]);
  const busy = ['scanning', 'connecting', 'pairing'].includes(state.status);
  const connected = ['pairing_required', 'pairing', 'paired'].includes(state.status);

  return <Card title="AI Passport 蓝牙配对" extra={<Tag color={state.status === 'paired' ? 'success' : state.status === 'error' ? 'error' : 'default'}>{STATUS[state.status]}</Tag>}>
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Paragraph style={{ margin: 0 }}>连接这台电脑附近的 AI Passport，输入设备屏幕上的六位码。此蓝牙状态独立于下方的小智 MCP 连接。</Typography.Paragraph>
      {!secure ? <Alert type="warning" showIcon message="当前页面不允许访问蓝牙" description="请通过 HTTPS 或在这台电脑上使用 http://localhost:5174 打开页面。普通 HTTP 局域网地址无法配对。" />
        : !bluetoothAvailable ? <Alert type="warning" showIcon message="当前浏览器不支持网页蓝牙" description="请在电脑的 Chrome 或 Edge 中打开此页面，并允许蓝牙访问。" /> : null}
      <Alert type="info" showIcon message="设备需要 DSH Passport 协议 v1 固件" description="打开设备蓝牙配对页，确认广播名为 Folo-PSP / FoloPassport-DSH。普通小智固件无法配对。配对后按住设备录音键说话，松开后转写并直接发送到网页聊天，不需要配置小智 MCP。语音识别使用平台配置的默认转写模型。" />
      <Steps size="small" current={state.status === 'paired' ? 2 : connected ? 1 : 0} items={[{ title: '扫描并选择设备' }, { title: '输入屏幕配对码' }, { title: '设备确认连接' }]} />
      <Space wrap>
        <Button type="primary" disabled={!secure || !client || connected || busy} loading={state.status === 'scanning' || state.status === 'connecting'} onClick={() => { setCode(''); void client?.connect(); }}>扫描并连接设备</Button>
        <Button disabled={!secure || !client || connected || busy} onClick={() => { setCode(''); void client?.connect(true); }}>找不到设备？显示所有设备</Button>
        <Button disabled={!client || (!connected && !busy)} onClick={() => client?.disconnect()}>断开连接</Button>
      </Space>
      <Typography.Text type="secondary">列表里也可能显示短名 Folo-PSP，或显示为未知设备。找不到时先关闭 DSH 等程序的蓝牙连接，再重启设备；“显示所有设备”用于排查，选中后仍需通过服务与配对校验。设备屏幕没有六位配对码时，请先确认固件是否支持此功能。</Typography.Text>
      {state.name && <Typography.Text>设备：{state.name}{state.deviceId ? ` · ${state.deviceId}` : ''}</Typography.Text>}
      {state.status === 'pairing_required' && <Space wrap>
        <Input aria-label="设备六位配对码" placeholder="设备屏幕上的六位配对码" value={code} maxLength={6} inputMode="numeric" autoComplete="off" style={{ width: 240 }} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onPressEnter={() => { if (/^\d{6}$/.test(code)) void client?.pair(code); }} />
        <Button type="primary" disabled={!/^\d{6}$/.test(code)} onClick={() => void client?.pair(code)}>确认配对</Button>
      </Space>}
      {state.error && <Alert type="error" showIcon message={state.error} />}
      {state.status === 'paired' && <Alert type="success" showIcon message="设备已确认配对与信任握手" description="语音直接发送到聊天；AI 回复后设备显示状态和结果摘要，全文在聊天窗口查看。可站内切换页面继续使用蓝牙，关闭标签页或掉线后需要重新连接。" />}
      {state.status === 'paired' && <Button onClick={() => useChatStore.getState().setOpen(true)}>打开聊天窗口</Button>}
      {voiceStatus && <Alert type={voiceError ? 'error' : 'info'} showIcon message={voiceStatus} />}
      {transcript && <Typography.Paragraph copyable={{ text: transcript }}>最近识别：{transcript}</Typography.Paragraph>}
      {connected && <Button danger disabled={busy} onClick={() => modal.confirm({ title: '重置设备配对？', content: '将通知设备清除当前配对信任。其他主机可能需要重新配对；设备确认后，本标签页凭据也会删除。', onOk: async () => { await client?.unpair(); setCode(''); } })}>{state.status === 'paired' ? '解除设备配对' : '重置设备配对'}</Button>}
      <Typography.Text type="secondary">信任凭据按当前登录账户隔离，仅保存在本标签页会话中；这不代表云端设备所有权绑定。关闭标签页后再次使用可能需要重置并重新配对。平台登录令牌不会发送到设备。</Typography.Text>
    </Space>
  </Card>;
}
