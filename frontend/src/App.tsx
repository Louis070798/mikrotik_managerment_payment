import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { setupMockApi } from './mock';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { GlobalDashboard } from './pages/GlobalDashboard';
import { AreaDashboard } from './pages/AreaDashboard';
import { ShipDashboard } from './pages/ShipDashboard';
import { Devices } from './pages/Devices';
import { DeviceDetail } from './pages/DeviceDetail';
import { RadiusAaa } from './pages/RadiusAaa';
import { VpnZeroTier } from './pages/VpnZeroTier';
import { Packages } from './pages/Packages';
import { Users } from './pages/Users';
import { SubscriberDetail } from './pages/SubscriberDetail';
import { BulkAssign } from './pages/BulkAssign';
import { Tenants } from './pages/Tenants';
import './index.css';
import './lib/apiClient';

if (import.meta.env.VITE_USE_MOCK_API === 'true') setupMockApi();

import { PagePlaceholder } from './components/PagePlaceholder';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<GlobalDashboard />} />
            <Route path="/areas" element={<AreaDashboard />} />
            <Route path="/ships" element={<ShipDashboard />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/devices/:deviceId" element={<DeviceDetail />} />
            <Route path="/users" element={<Users />} />
            <Route path="/users/:subscriberId" element={<SubscriberDetail />} />
            <Route path="/data-analysis" element={<PagePlaceholder title="Phân tích dữ liệu" description="Tính năng Phân tích dữ liệu chưa được cung cấp Endpoint từ Backend." />} />
            <Route path="/packages" element={<Packages />} />
            <Route path="/bulk-assign" element={<BulkAssign />} />
            <Route path="/radius" element={<RadiusAaa />} />
            <Route path="/vpn" element={<VpnZeroTier />} />
            <Route path="/tenants" element={<Tenants />} />
            <Route path="/billing" element={<PagePlaceholder title="Hoá đơn" description="Quản lý thanh toán, hoá đơn tự động và tích hợp gateway thanh toán." />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
