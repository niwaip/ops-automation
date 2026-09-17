#include "ble_gateway_protocol.h"

#include <esp_log.h>
#include <cJSON.h>
#include <cstring>

#define TAG "BleGatewayProtocol"

BleGatewayProtocol::BleGatewayProtocol() {
    event_group_handle_ = xEventGroupCreate();
}

BleGatewayProtocol::~BleGatewayProtocol() {
    if (event_group_handle_ != nullptr) {
        vEventGroupDelete(event_group_handle_);
    }
}

bool BleGatewayProtocol::Start() {
    ESP_LOGI(TAG, "Starting BLE Gateway Protocol...");
    // When phone connects, HandlePeerConnected will be invoked
    return true;
}

bool BleGatewayProtocol::OpenAudioChannel() {
    if (!is_connected_) {
        ESP_LOGW(TAG, "Cannot open audio channel: Phone BLE not connected");
        return false;
    }
    is_audio_opened_ = true;
    if (on_audio_channel_opened_) {
        on_audio_channel_opened_();
    }
    // Notify phone that audio stream has started
    cJSON* root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "audio.start");
    cJSON_AddNumberToObject(root, "sample_rate", server_sample_rate_);
    char* json = cJSON_PrintUnformatted(root);
    SendText(json);
    cJSON_free(json);
    cJSON_Delete(root);
    return true;
}

void BleGatewayProtocol::CloseAudioChannel(bool send_goodbye) {
    if (!is_audio_opened_) {
        return;
    }
    is_audio_opened_ = false;
    if (send_goodbye && is_connected_) {
        cJSON* root = cJSON_CreateObject();
        cJSON_AddStringToObject(root, "type", "audio.end");
        char* json = cJSON_PrintUnformatted(root);
        SendText(json);
        cJSON_free(json);
        cJSON_Delete(root);
    }
    if (on_audio_channel_closed_) {
        on_audio_channel_closed_();
    }
}

bool BleGatewayProtocol::IsAudioChannelOpened() const {
    return is_audio_opened_;
}

bool BleGatewayProtocol::SendAudio(std::unique_ptr<AudioStreamPacket> packet) {
    if (!is_connected_ || !is_audio_opened_ || !packet) {
        return false;
    }

    // Packetize and transmit over BLE
    // In actual implementation, send over BLE GATT Audio characteristic
    ESP_LOGD(TAG, "Sending audio packet: %zu bytes", packet->payload.size());
    return true;
}

bool BleGatewayProtocol::SendText(const std::string& text) {
    if (!is_connected_) {
        ESP_LOGW(TAG, "Cannot send text: BLE peer disconnected");
        return false;
    }
    ESP_LOGD(TAG, "Sending JSON to phone: %s", text.c_str());
    // Transmission to phone over BLE Control characteristic
    return true;
}

void BleGatewayProtocol::HandlePeerConnected() {
    ESP_LOGI(TAG, "Companion phone connected via BLE");
    is_connected_ = true;
    xEventGroupSetBits(event_group_handle_, BLE_GATEWAY_CONNECTED_EVENT);
    if (on_connected_) {
        on_connected_();
    }
}

void BleGatewayProtocol::HandlePeerDisconnected() {
    ESP_LOGI(TAG, "Companion phone disconnected");
    is_connected_ = false;
    is_audio_opened_ = false;
    xEventGroupClearBits(event_group_handle_, BLE_GATEWAY_CONNECTED_EVENT | BLE_GATEWAY_AUDIO_READY_EVENT);
    if (on_disconnected_) {
        on_disconnected_();
    }
}

void BleGatewayProtocol::HandleIncomingAudioData(const uint8_t* data, size_t len) {
    if (!on_incoming_audio_ || len == 0) {
        return;
    }
    auto packet = std::make_unique<AudioStreamPacket>();
    packet->sample_rate = server_sample_rate_;
    packet->frame_duration = server_frame_duration_;
    packet->payload.assign(data, data + len);
    on_incoming_audio_(std::move(packet));
}

void BleGatewayProtocol::HandleIncomingJsonText(const char* json_str) {
    if (!json_str || !on_incoming_json_) {
        return;
    }
    cJSON* root = cJSON_Parse(json_str);
    if (root != nullptr) {
        on_incoming_json_(root);
        cJSON_Delete(root);
    } else {
        ESP_LOGE(TAG, "Failed to parse incoming JSON from phone: %s", json_str);
    }
}
