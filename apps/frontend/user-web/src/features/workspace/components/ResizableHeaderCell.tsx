import React, { useCallback, useRef } from 'react';
import styles from './ResizableHeaderCell.module.css';

export interface ResizableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  onResize?: (width: number) => void;
  onReset?: () => void;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
}

export const ResizableHeaderCell: React.FC<ResizableHeaderCellProps> = ({
  children,
  className,
  style,
  onResize,
  onReset,
  width,
  minWidth = 50,
  maxWidth = 800,
  resizable,
  ...restProps
}) => {
  const isDraggingRef = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      if (!onResize) return;
      e.preventDefault();
      e.stopPropagation();

      isDraggingRef.current = true;
      const startX = e.clientX;
      const initialWidth = width || 100;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const deltaX = moveEvent.clientX - startX;
        const newWidth = Math.min(maxWidth, Math.max(minWidth, Math.round(initialWidth + deltaX)));
        onResize(newWidth);
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onResize, width, minWidth, maxWidth]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.stopPropagation();
      onReset?.();
    },
    [onReset]
  );

  if (!resizable || !onResize) {
    return (
      <th className={className} style={style} {...restProps}>
        {children}
      </th>
    );
  }

  return (
    <th
      className={`${className || ''} ${styles['resizable-th']}`}
      style={{
        ...style,
        position: 'relative',
      }}
      {...restProps}
    >
      {children}
      <span
        className={styles['col-resize-handle']}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onClick={(e) => e.stopPropagation()}
        title="按住拖拽调整列宽，双击重置默认宽度"
      />
    </th>
  );
};
