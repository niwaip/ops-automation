#include "protocol_router.h"

#include <esp_log.h>

#define TAG "ProtocolRouter"

std::unique_ptr<Protocol> ProtocolRouter::CreateProtocol(TransportType type) {
    if (type == kTransportBlePhone) {
        ESP_LOGI(TAG, "Selected Transport: BLE Gateway (Companion Phone)");
        return std::make_unique<BleGatewayProtocol>();
    }

    ESP_LOGI(TAG, "Selected Transport: Direct Wi-Fi Gateway (WebSocket)");
    return std::make_unique<WebsocketProtocol>();
}
