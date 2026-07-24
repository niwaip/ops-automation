import { useState, useReducer } from 'react';
import type { ActivityDTO } from '@/api/activity';
import {
  realValidateReducer,
  initialRealValidateState,
  type ActivityFormData,
} from '../utils/activityHelpers';

export function useActivityState() {
  const [activeTab, setActiveTab] = useState<'custom' | 'builtin'>('custom');
  const [searchText, setSearchText] = useState('');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityDTO | null>(null);
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [currentCode, setCurrentCode] = useState('');
  const [currentActivityName, setCurrentActivityName] = useState('');

  const [realValidateState, dispatchRealValidation] = useReducer(
    realValidateReducer,
    initialRealValidateState
  );

  const [testModalVisible, setTestModalVisible] = useState(false);
  const [testActivity, setTestActivity] = useState<ActivityDTO | null>(null);
  const [testInputParams, setTestInputParams] = useState<Record<string, string>>({});
  const [testLogs, setTestLogs] = useState<string[]>([]);

  const [formData, setFormData] = useState<ActivityFormData>({
    name: '',
    fn: '',
    description: '',
    isActive: true,
    startToCloseTimeout: '60s',
    steps: [],
  });

  return {
    activeTab,
    setActiveTab,
    searchText,
    setSearchText,
    createModalVisible,
    setCreateModalVisible,
    editingActivity,
    setEditingActivity,
    codeModalVisible,
    setCodeModalVisible,
    currentCode,
    setCurrentCode,
    currentActivityName,
    setCurrentActivityName,
    realValidateState,
    dispatchRealValidation,
    testModalVisible,
    setTestModalVisible,
    testActivity,
    setTestActivity,
    testInputParams,
    setTestInputParams,
    testLogs,
    setTestLogs,
    formData,
    setFormData,
  };
}
