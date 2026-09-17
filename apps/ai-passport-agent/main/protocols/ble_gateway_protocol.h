#ifndef _BLE_GATEWAY_PROTOCOL_H_
#define _BLE_GATEWAY_PROTOCOL_H_

#include "protocol.h"

#include <freertos/FreeRTOS.h>
#include <freertos/event_groups.h>
#include <atomic>
#include <memory>
#include <string>

#define BLE_GATEWAY_CONNECTED_EVENT   (1 << 0)
#define BLE_GATEWAY_AUDIO_READY_EVENT (1 << 1)

/**
 * @brief BleGatewayProtocol connects AI Passport to a companion mobile phone
 * (e.g. WeChat Mini-Program or Mobile App) via Bluetooth LE GATT.
 * The mobile phone serves as a transparent internet relay to the AI Gateway.
 */
class BleGatewayProtocol : public Protocol {
public:
    BleGatewayProtocol();
    ~BleGatewayProtocol() override;

    bool Start() override;
    bool SendAudio(std::unique_ptr<AudioStreamPacket> packet) override;
    bool OpenAudioChannel() override;
    void CloseAudioChannel(bool send_goodbye = true) override;
    bool IsAudioChannelOpened() const override;

    // Called by BLE stack when phone connects/disconnects
    void HandlePeerConnected();
    void HandlePeerDisconnected();

    // Called when data arrives from the phone GATT characteristic
    void HandleIncomingAudioData(const uint8_t* data, size_t len);
    void HandleIncomingJsonText(const char* json_str);

private:
    EventGroupHandle_t event_group_handle_ = nullptr;
    std::atomic<bool> is_connected_{false};
    std::atomic<bool> is_audio_opened_{false};

    bool SendText(const std::string& text) override;
    void SendGattNotification(uint16_t char_handle, const uint8_t* data, size_t len);
};

#endif  // _BLE_GATEWAY_PROTOCOL_H_
