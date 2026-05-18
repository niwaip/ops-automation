import { BrowserRouter } from 'react-router-dom';
import AppRoutes from '@/app/router/AppRoutes';

const App: React.FC = () => (
  <BrowserRouter
    future={{
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    }}
  >
    <AppRoutes />
  </BrowserRouter>
);

export default App;
