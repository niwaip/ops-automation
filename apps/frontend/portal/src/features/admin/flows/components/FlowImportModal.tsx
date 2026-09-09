import React, { useState } from "react";
import { Alert, Input, Modal, message, Space } from "antd";
import { useMutation, useQueryClient } from "react-query";
import { executionFlowApi } from "@/api/flows";

const { TextArea } = Input;

interface FlowImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const FlowImportModal: React.FC<FlowImportModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [importJson, setImportJson] = useState("");

  const importMutation = useMutation(executionFlowApi.import, {
    onSuccess: () => {
      message.success("导入成功");
      queryClient.invalidateQueries(["flows"]);
      setImportJson("");
      onSuccess();
    },
    onError: () => {
      message.error("导入失败，请检查JSON格式");
    },
  });

  const handleImport = () => {
    try {
      const data = JSON.parse(importJson);
      importMutation.mutate(data);
    } catch {
      message.error("无效的JSON格式");
    }
  };

  return (
    <Modal
      title="导入工作流组合配置"
      open={open}
      onOk={handleImport}
      onCancel={() => {
        setImportJson("");
        onClose();
      }}
      confirmLoading={importMutation.isLoading}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Alert type="info" message="请粘贴导出的工作流组合 JSON 数据" showIcon />
        <TextArea
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
          placeholder="粘贴JSON..."
          rows={10}
        />
      </Space>
    </Modal>
  );
};
