import { useState, useCallback, useEffect } from 'react';

export interface WorkspaceColumnWidths {
  nameMinWidth: number;
  fileSize: number;
  type: number;
  updatedAt: number;
  action: number;
}

export const DEFAULT_WORKSPACE_COLUMN_WIDTHS: WorkspaceColumnWidths = {
  nameMinWidth: 240, // 名称基准最小宽度，保证空间充裕，同时不设上限自动填充满剩余空间
  fileSize: 80,      // 大小列收紧（80px 足够展示 "256.2 KB" 或 "334 项"）
  type: 75,          // 类型列收紧（75px 足够展示 "文件夹"、"PDF"、"XLSX"）
  updatedAt: 155,    // 修改时间收紧（155px 刚好单行显示 "2026/10/30 17:31:55"）
  action: 115,       // 操作列收紧（115px 刚好容纳 3 个快捷图标与删除按钮）
};

const STORAGE_KEY = 'ops_workspace_table_col_widths_v2';

export function useWorkspaceColumnWidths() {
  const [widths, setWidths] = useState<WorkspaceColumnWidths>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_WORKSPACE_COLUMN_WIDTHS, ...parsed };
      }
    } catch {
      // 忽略解析错误并回退默认值
    }
    return DEFAULT_WORKSPACE_COLUMN_WIDTHS;
  });

  // 持久化存储至 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
    } catch {
      // 忽略存储失败
    }
  }, [widths]);

  const updateWidth = useCallback((key: keyof WorkspaceColumnWidths, width: number) => {
    setWidths((prev) => ({
      ...prev,
      [key]: width,
    }));
  }, []);

  const resetWidth = useCallback((key?: keyof WorkspaceColumnWidths) => {
    if (key) {
      setWidths((prev) => ({
        ...prev,
        [key]: DEFAULT_WORKSPACE_COLUMN_WIDTHS[key],
      }));
    } else {
      setWidths(DEFAULT_WORKSPACE_COLUMN_WIDTHS);
    }
  }, []);

  return {
    widths,
    updateWidth,
    resetWidth,
  };
}
