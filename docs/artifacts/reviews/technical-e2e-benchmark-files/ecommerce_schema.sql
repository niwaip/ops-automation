-- 核心电商表结构定义
CREATE TABLE dim_users (
    user_id BIGINT PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(16) DEFAULT 'active'
);

CREATE TABLE fct_orders (
    order_id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    order_status VARCHAR(32) NOT NULL, -- 'PAID', 'CANCELLED', 'REFUNDED'
    total_amount NUMERIC(12, 2) NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE fct_order_items (
    item_id BIGINT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    category_id INT NOT NULL,
    category_name VARCHAR(64) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    quantity INT NOT NULL,
    subtotal_amount NUMERIC(12, 2) NOT NULL
);
