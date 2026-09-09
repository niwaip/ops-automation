import { useState, useReducer } from 'react';
import type { ActivityDTO, CreateActivityDto } from '@/api/activity';
import type { ActivityQuickFilter } from '../components/ActivityOverviewCards';
import {
  realValidateReducer,
  initialRealValidateState,
  type ActivityFormData,
} from '../utils/activityHelpers';

export function useActivityState() {
  const [activeTab, setActiveTab] = useState<'custom' | 'builtin'>('custom');
  const [activeFilter, setActiveFilter] = useState<ActivityQuickFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityDTO | null>(null);
  const [initialDraft, setInitialDraft] = useState<Partial<CreateActivityDto> | null>(null);
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
    activeFilter,
    setActiveFilter,
    searchText,
    setSearchText,
    createModalVisible,
    setCreateModalVisible,
    editingActivity,
    setEditingActivity,
    initialDraft,
    setInitialDraft,
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
