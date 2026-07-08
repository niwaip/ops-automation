import React from 'react';
import { Image, Space, Typography } from 'antd';

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
              <Image key={item.key} src={item.src} alt={item.alt} style={imageStyle} />
            ))}
          </Space>
        </Image.PreviewGroup>
      )}
    </div>
  );
};

export default ExecutionImageGallery;
