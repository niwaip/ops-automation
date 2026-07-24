import { useState } from 'react';

export function useExecutionDetailState() {
  const [activeTabKey, setActiveTabKey] = useState<string>('timeline');
  const [filterStepStatus, setFilterStepStatus] = useState<string>('all');
  const [artifactsDrawerVisible, setArtifactsDrawerVisible] = useState(false);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [isAutoScrollLogs, setIsAutoScrollLogs] = useState(true);

  return {
    activeTabKey,
    setActiveTabKey,
    filterStepStatus,
    setFilterStepStatus,
    artifactsDrawerVisible,
    setArtifactsDrawerVisible,
    selectedPhaseId,
    setSelectedPhaseId,
    isAutoScrollLogs,
    setIsAutoScrollLogs,
  };
}
