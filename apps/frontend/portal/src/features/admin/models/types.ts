export interface AIModelFilterState {
  search?: string;
  provider?: string;
  status?: string;
}

export type AIModelTabKey = 'models' | 'providers' | 'test';
