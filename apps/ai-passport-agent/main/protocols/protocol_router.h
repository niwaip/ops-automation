#ifndef _PROTOCOL_ROUTER_H_
#define _PROTOCOL_ROUTER_H_

#include "protocol.h"
#include "websocket_protocol.h"
#include "ble_gateway_protocol.h"
#include <memory>

enum TransportType {
    kTransportAuto,
    kTransportWiFi,
    kTransportBlePhone,
};

class ProtocolRouter {
public:
    static std::unique_ptr<Protocol> CreateProtocol(TransportType type = kTransportAuto);
};

#endif  // _PROTOCOL_ROUTER_H_
