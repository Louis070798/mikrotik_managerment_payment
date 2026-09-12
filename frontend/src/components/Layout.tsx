import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Router, Users, BarChart2, Package, Layers, Shield, Network, Building2, FileText, Anchor, Settings as SettingsIcon } from 'lucide-react';
import { HeaderActionsContext } from '../lib/headerActions';

export const Layout: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [headerActions, setHeaderActions] = useState<React.ReactNode>(null);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('permissions');
        localStorage.removeItem('role');
        localStorage.removeItem('actorName');
        navigate('/login');
    };

    // Danh tinh THAT tu lan dang nhap gan nhat (xem Login.tsx + AuthService.login()) — trong khi
    // chua co RBAC theo tung tenant, day van la dau hieu ro nhat "ai dang dung phien nay".
    const actorName = localStorage.getItem('actorName') || 'Dev Actor';
    const actorRole = localStorage.getItem('role') === 'tenant' ? 'tenant' : 'superadmin';
    const actorInitials = actorName.split(/\s+/).filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase() || '?';

    // Page Title based on route
    const getPageTitle = () => {
        if (location.pathname === '/') return { breadcrumb: 'HỆ THỐNG / TỔNG QUAN', title: 'Trung tâm điều hành' };
        if (location.pathname === '/areas') return { breadcrumb: 'HỆ THỐNG / TỔNG QUAN', title: 'Theo khu vực' };
        if (location.pathname === '/ships') return { breadcrumb: 'HỆ THỐNG / TỔNG QUAN', title: 'Theo tàu' };
        if (location.pathname === '/devices') return { breadcrumb: 'HỆ THỐNG / THIẾT BỊ', title: 'Thiết bị MikroTik' };
        if (location.pathname.startsWith('/devices/')) return { breadcrumb: 'HỆ THỐNG / THIẾT BỊ', title: 'Chi tiết thiết bị' };
        if (location.pathname === '/users') return { breadcrumb: 'THUÊ BAO / NGƯỜI DÙNG', title: 'Quản lý người dùng' };
        if (location.pathname.startsWith('/users/')) return { breadcrumb: 'THUÊ BAO / NGƯỜI DÙNG', title: 'Chi tiết user' };
        if (location.pathname === '/packages') return { breadcrumb: 'GÓI & HẠ TẦNG / GÓI CƯỚC', title: 'Gói cước' };
        if (location.pathname === '/bulk-assign') return { breadcrumb: 'GÓI & HẠ TẦNG / GÁN GÓI', title: 'Gán gói hàng loạt' };
        if (location.pathname === '/radius') return { breadcrumb: 'HẠ TẦNG / RADIUS', title: 'RADIUS / AAA' };
        if (location.pathname === '/vpn') return { breadcrumb: 'HẠ TẦNG / VPN', title: 'VPN ZeroTier' };
        if (location.pathname === '/tenants') return { breadcrumb: 'TỔ CHỨC / TENANT', title: 'Tenant & phân cấp' };
        if (location.pathname === '/settings') return { breadcrumb: 'HỆ THỐNG / CÀI ĐẶT', title: 'Cài đặt' };
        return { breadcrumb: 'HỆ THỐNG', title: 'Trang chủ' };
    };

    const { breadcrumb, title } = getPageTitle();

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f0f2f5', fontFamily: '"Inter", sans-serif' }}>
            {/* Sidebar */}
            <aside style={{ width: '250px', background: '#1c242c', color: '#8a99a8', display: 'flex', flexDirection: 'column', height: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 100 }}>
                {/* Logo Area */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '20px 24px', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ background: '#009688', color: '#fff', fontWeight: 'bold', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', fontSize: '14px' }}>
                        RB
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '15px', lineHeight: '1.2' }}>RouterBridge</span>
                        <span style={{ fontSize: '10px', letterSpacing: '0.05em', color: '#8a99a8' }}>NOC CONSOLE</span>
                    </div>
                </div>

                {/* Nav Links */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* VẬN HÀNH */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#5b6b7a', paddingLeft: '8px', letterSpacing: '0.1em' }}>Vận hành</div>
                        <NavLink to="/" end className={({ isActive }) => `nav-item-custom ${isActive ? 'active' : ''}`} style={navItemStyle}>
                            <LayoutDashboard size={18} />
                            <span>Tổng quan</span>
                        </NavLink>
                        <NavLink to="/devices" className={({ isActive }) => `nav-item-custom ${isActive ? 'active' : ''}`} style={({ isActive }) => ({ ...navItemStyle, ...(isActive ? activeStyle : {}) })}>
                            <Router size={18} />
                            <span style={{ flex: 1 }}>Thiết bị MikroTik</span>
                            <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: '12px', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>2</span>
                        </NavLink>
                        <NavLink to="/ships" className={({ isActive }) => `nav-item-custom ${isActive ? 'active' : ''}`} style={({ isActive }) => ({ ...navItemStyle, ...(isActive ? activeStyle : {}) })}>
                            <Anchor size={18} />
                            <span>Tàu</span>
                        </NavLink>
                    </div>

                    {/* KHÁCH HÀNG */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#5b6b7a', paddingLeft: '8px', letterSpacing: '0.1em' }}>Khách hàng</div>
                        <NavLink to="/users" className={({ isActive }) => `nav-item-custom ${isActive ? 'active' : ''}`} style={({ isActive }) => ({ ...navItemStyle, ...(isActive ? activeStyle : {}) })}>
                            <Users size={18} />
                            <span>Người dùng</span>
                        </NavLink>
                        <NavLink to="/data-analysis" className={({ isActive }) => `nav-item-custom ${isActive ? 'active' : ''}`} style={({ isActive }) => ({ ...navItemStyle, ...(isActive ? activeStyle : {}) })}>
                            <BarChart2 size={18} />
                            <span>Phân tích dữ liệu</span>
                        </NavLink>
                    </div>

                    {/* GÓI & HẠ TẦNG */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#5b6b7a', paddingLeft: '8px', letterSpacing: '0.1em' }}>Gói & hạ tầng</div>
                        <NavLink to="/packages" className={({ isActive }) => `nav-item-custom ${isActive ? 'active' : ''}`} style={({ isActive }) => ({ ...navItemStyle, ...(isActive ? activeStyle : {}) })}>
                            <Package size={18} />
                            <span>Gói cước</span>
                        </NavLink>
                        <NavLink to="/bulk-assign" className={({ isActive }) => `nav-item-custom ${isActive ? 'active' : ''}`} style={({ isActive }) => ({ ...navItemStyle, ...(isActive ? activeStyle : {}) })}>
                            <Layers size={18} />
                            <span>Gán gói hàng loạt</span>
                        </NavLink>
                        <NavLink to="/radius" className={({ isActive }) => `nav-item-custom ${isActive ? 'active' : ''}`} style={({ isActive }) => ({ ...navItemStyle, ...(isActive ? activeStyle : {}) })}>
                            <Shield size={18} />
                            <span>RADIUS / AAA</span>
                        </NavLink>
                        <NavLink to="/vpn" className={({ isActive }) => `nav-item-custom ${isActive ? 'active' : ''}`} style={({ isActive }) => ({ ...navItemStyle, ...(isActive ? activeStyle : {}) })}>
                            <Network size={18} />
                            <span>VPN ZeroTier</span>
                        </NavLink>
                    </div>

                    {/* TỔ CHỨC */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#5b6b7a', paddingLeft: '8px', letterSpacing: '0.1em' }}>Tổ chức</div>
                        <NavLink to="/tenants" className={({ isActive }) => `nav-item-custom ${isActive ? 'active' : ''}`} style={({ isActive }) => ({ ...navItemStyle, ...(isActive ? activeStyle : {}) })}>
                            <Building2 size={18} />
                            <span>Tenant & phân cấp</span>
                        </NavLink>
                        <NavLink to="/billing" className={({ isActive }) => `nav-item-custom ${isActive ? 'active' : ''}`} style={({ isActive }) => ({ ...navItemStyle, ...(isActive ? activeStyle : {}) })}>
                            <FileText size={18} />
                            <span>Hoá đơn</span>
                        </NavLink>
                    </div>

                    {/* HỆ THỐNG */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#5b6b7a', paddingLeft: '8px', letterSpacing: '0.1em' }}>Hệ thống</div>
                        <NavLink to="/settings" className={({ isActive }) => `nav-item-custom ${isActive ? 'active' : ''}`} style={({ isActive }) => ({ ...navItemStyle, ...(isActive ? activeStyle : {}) })}>
                            <SettingsIcon size={18} />
                            <span>Cài đặt</span>
                        </NavLink>
                    </div>
                </div>

                {/* Sidebar Footer */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '16px' }}>
                    <div style={{ background: '#252f38', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#8a99a8' }}>ROUTEROS API</span>
                            <div className="status-live-dot" />
                        </div>
                        <div style={{ fontSize: '12px', color: '#a0aec0' }}>
                            Poller 15s - 7/8 kết nối
                        </div>
                    </div>

                    <div className="sidebar-avatar-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={handleLogout} title="Logout">
                        <div className="sidebar-avatar" style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>
                            {actorInitials}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{actorName}</span>
                            <span style={{ color: '#8a99a8', fontSize: '12px' }}>{actorRole}</span>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Wrapper */}
            <div style={{ flex: 1, marginLeft: '250px', display: 'flex', flexDirection: 'column', height: '100vh' }}>

                {/* Header Navbar */}
                <header style={{
                    height: '64px',
                    background: '#fff',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 24px',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', letterSpacing: '0.05em' }}>
                            {breadcrumb}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <span style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>{title}</span>
                        </div>
                    </div>

                    {headerActions}
                </header>

                {/* Main Content Area */}
                <main style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#f8fafc' }}>
                    <HeaderActionsContext.Provider value={setHeaderActions}>
                        <Outlet />
                    </HeaderActionsContext.Provider>
                </main>
            </div>

            {/* Custom styles injected for active class since inline active is complex in NavLink */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .nav-item-custom {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 8px 12px;
                    border-radius: 6px;
                    color: #8a99a8;
                    text-decoration: none;
                    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s, color 0.2s, border-color 0.2s;
                    font-size: 14px;
                    border: 1px solid transparent;
                }
                .nav-item-custom svg {
                    transition: transform 0.2s ease;
                    flex-shrink: 0;
                }
                .nav-item-custom:hover {
                    background: rgba(255,255,255,0.05);
                    color: #fff;
                    transform: translateX(3px);
                }
                .nav-item-custom:hover svg {
                    transform: scale(1.12);
                }
                .nav-item-custom.active {
                    background: rgba(0, 150, 136, 0.1);
                    color: #009688;
                    border: 1px solid #009688;
                }

                /* Chấm "đang sống" cạnh ROUTEROS API -- vòng sáng lan toả nhẹ, kiểu "live indicator"
                   phổ biến trên uiverse.io (tags/animation), báo hiệu poller vẫn đang chạy chứ
                   không phải 1 chấm tĩnh vô nghĩa. */
                .status-live-dot {
                    width: 6px;
                    height: 6px;
                    background: #10b981;
                    border-radius: 50%;
                    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55);
                    animation: statusLivePulse 2s ease-out infinite;
                }
                @keyframes statusLivePulse {
                    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55); }
                    70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                }

                /* Avatar logout -- trước đây cursor:pointer nhưng KHÔNG có phản hồi hover nào, người
                   dùng không biết đây là nút bấm được. Thêm viền sáng + nhích nhẹ khi hover/bấm. */
                .sidebar-avatar {
                    transition: box-shadow 0.2s ease, transform 0.15s ease;
                }
                .sidebar-avatar-row:hover .sidebar-avatar {
                    box-shadow: 0 0 0 3px rgba(0, 150, 136, 0.35);
                    transform: scale(1.05);
                }
                .sidebar-avatar-row:active .sidebar-avatar {
                    transform: scale(0.96);
                }

                @media (prefers-reduced-motion: reduce) {
                    .status-live-dot { animation: none; }
                    .nav-item-custom, .nav-item-custom svg, .sidebar-avatar { transition: none; }
                }
            `}} />
        </div>
    );
};

const navItemStyle = {};
const activeStyle = {};

