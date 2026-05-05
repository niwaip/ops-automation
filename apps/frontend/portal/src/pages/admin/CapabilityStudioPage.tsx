import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

const CapabilityStudioPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const releaseId = searchParams.get('releaseId');
  const target = releaseId
    ? `/admin/capabilities?releaseId=${encodeURIComponent(releaseId)}&mode=view&tab=studio`
    : '/admin/capabilities';

  return <Navigate to={target} replace />;
};

export default CapabilityStudioPage;
