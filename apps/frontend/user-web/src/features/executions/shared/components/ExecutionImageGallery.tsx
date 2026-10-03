import React from 'react';
import { Image, Space, Typography } from 'antd';
import { EyeOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface ExecutionImageGalleryItem {
  key: string;
  src: string;
  alt: string;
}

interface ExecutionImageGalleryProps {
  items: ExecutionImageGalleryItem[];
  imageStyle: React.CSSProperties;
  title?: React.ReactNode;
  emptyText?: React.ReactNode;
  titleMarginBottom?: number;
}

const ExecutionImageGallery: React.FC<ExecutionImageGalleryProps> = ({
  items,
  imageStyle,
  title,
  emptyText,
  titleMarginBottom = 8,
}) => {
  if (items.length === 0) {
    return emptyText ? <Text type="secondary">{emptyText}</Text> : null;
  }

  const previewConfig = {
    mask: (
      <Space size={4} style={{ fontSize: 12 }}>
        <EyeOutlined />
        <span>查看高清原图</span>
      </Space>
    ),
  };

  return (
    <div>
      {title ? (
        <>
          <Text strong>{title}</Text>
          <div style={{ marginTop: titleMarginBottom }}>
            <Image.PreviewGroup>
              <Space wrap size={12}>
                {items.map((item) => (
                  <Image
                    key={item.key}
                    src={item.src}
                    alt={item.alt}
                    style={imageStyle}
                    preview={previewConfig}
                  />
                ))}
              </Space>
            </Image.PreviewGroup>
          </div>
        </>
      ) : (
        <Image.PreviewGroup>
          <Space wrap size={12}>
            {items.map((item) => (
              <Image
                key={item.key}
                src={item.src}
                alt={item.alt}
                style={imageStyle}
                preview={previewConfig}
              />
            ))}
          </Space>
        </Image.PreviewGroup>
      )}
    </div>
  );
};

export default ExecutionImageGallery;
