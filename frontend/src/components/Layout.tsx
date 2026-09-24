import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Router, Users, BarChart2, Package, Layers, Shield, Network, Building2,
    FileText, Anchor, Settings as SettingsIcon, Radar, PanelLeft, LogOut,
} from 'lucide-react';
import { HeaderActionsContext } from '../lib/headerActions';

type NavItem = { to: string; end?: boolean; icon: React.ReactNode; label: string; badge?: string };
type NavGroup = { key: string; label: string; items: NavItem[] };

// Giu nguyen cau truc 5 nhom cua ban top-bar cu. Khac biet: rail doc hien THANG tat ca muc,
// khong con dropdown -- nhan nhan nhom chi la tieu de phan cach khi rail dang mo rong.
const NAV_GROUPS: NavGroup[] = [
    {
        key: 'operations', label: 'Vận hành', items: [
            { to: '/', end: true, icon: <LayoutDashboard size={18} />, label: 'Tổng quan' },
            { to: '/devices', icon: <Router size={18} />, label: 'Router MikroTik' },
            { to: '/ships', icon: <Anchor size={18} />, label: 'Tàu' },
        ],
    },
    {
        key: 'customers', label: 'Khách hàng', items: [
            { to: '/users', icon: <Users size={18} />, label: 'Người dùng' },
            { to: '/data-analysis', icon: <BarChart2 size={18} />, label: 'Phân tích dữ liệu' },
        ],
    },
    {
        key: 'infra', label: 'Gói & hạ tầng', items: [
            { to: '/packages', icon: <Package size={18} />, label: 'Gói cước' },
            { to: '/bulk-assign', icon: <Layers size={18} />, label: 'Gán gói hàng loạt' },
            { to: '/radius', icon: <Shield size={18} />, label: 'RADIUS / AAA' },
            { to: '/vpn', icon: <Network size={18} />, label: 'VPN ZeroTier' },
        ],
    },
    {
        key: 'org', label: 'Tổ chức', items: [
            { to: '/tenants', icon: <Building2 size={18} />, label: 'Tenant & phân cấp' },
            { to: '/billing', icon: <FileText size={18} />, label: 'Hoá đơn' },
        ],
    },
    {
        key: 'system', label: 'Hệ thống', items: [
            { to: '/settings', icon: <SettingsIcon size={18} />, label: 'Cài đặt' },
        ],
    },
];

const RAIL_STORAGE_KEY = 'railExpanded';

export const Layout: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [headerActions, setHeaderActions] = useState<React.ReactNode>(null);

    // Mac dinh THU GON (chi icon) dung nhu ban thiet ke. Nho lua chon cua nguoi dung giua cac
    // lan mo -- try/catch vi localStorage co the bi chan (cua so an danh, chinh sach trinh duyet).
    const [expanded, setExpanded] = useState<boolean>(() => {
        try { return localStorage.getItem(RAIL_STORAGE_KEY) === 'true'; } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem(RAIL_STORAGE_KEY, String(expanded)); } catch { /* bo qua */ }
    }, [expanded]);

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
    // Moi trang chi con MOT dong ten. Bo breadcrumb "HE THONG / ..." -- rail doc ben trai da
    // cho biet dang o nhom nao, dong chu nho do chi lap lai thong tin va day header len 2 tang.
    const getPageTitle = () => {
        if (location.pathname === '/') return 'Trung tâm điều hành';
        if (location.pathname === '/areas') return 'Theo khu vực';
        if (location.pathname === '/ships') return 'Theo tàu';
        if (location.pathname === '/devices') return 'Router MikroTik';
        // Trang chi tiet tu hien ten thiet bi lam h1 -- de trong de header khong lap lai.
        if (location.pathname.startsWith('/devices/')) return '';
        if (location.pathname === '/users') return 'Quản lý người dùng';
        if (location.pathname.startsWith('/users/')) return 'Chi tiết user';
        if (location.pathname === '/packages') return 'Gói cước';
        if (location.pathname === '/bulk-assign') return 'Gán gói hàng loạt';
        if (location.pathname === '/radius') return 'RADIUS / AAA';
        if (location.pathname === '/vpn') return 'VPN ZeroTier';
        if (location.pathname === '/data-analysis') return 'Phân tích dữ liệu';
        if (location.pathname === '/billing') return 'Hoá đơn';
        if (location.pathname === '/tenants') return 'Tenant & phân cấp';
        if (location.pathname === '/settings') return 'Cài đặt';
        return 'Trang chủ';
    };

    const title = getPageTitle();

    return (
        <div className={`app-shell ${expanded ? 'rail-open' : ''}`}>

            {/* Rail dieu huong doc — thay cho top-bar HUD cu. Khong con dropdown, khong con do
                be rong bang JS: moi muc hien thang, nen bo duoc toan bo ResizeObserver/
                getBoundingClientRect cua ban truoc. */}
            <nav className="rail" role="navigation" aria-label="Điều hướng chính">
                <div className="rail-brand">
                    <div className="rail-brand-mark" aria-hidden="true">RB</div>
                    <div className="rail-brand-text">
                        <span className="rail-brand-name">RouterBridge</span>
                        <span className="rail-brand-sub">NOC CONSOLE</span>
                    </div>
                </div>

                <button
                    type="button"
                    className="rail-toggle"
                    onClick={() => setExpanded(v => !v)}
                    title={expanded ? 'Thu gọn thanh điều hướng' : 'Mở rộng thanh điều hướng'}
                    aria-label={expanded ? 'Thu gọn thanh điều hướng' : 'Mở rộng thanh điều hướng'}
                    aria-expanded={expanded}
                >
                    <PanelLeft size={16} />
                    <span className="rail-label">Thu gọn</span>
                </button>

                <div className="rail-scroll">
                    {NAV_GROUPS.map(group => (
                        <div key={group.key} className="rail-group">
                            <div className="rail-group-label">{group.label}</div>
                            {group.items.map(item => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.end}
                                    className={({ isActive }) => `rail-item ${isActive ? 'active' : ''}`}
                                    // title = tooltip cua trinh duyet, la cach duy nhat biet muc nao la
                                    // gi khi rail dang thu gon chi con icon.
                                    title={item.label}
                                >
                                    <span className="rail-icon">{item.icon}</span>
                                    <span className="rail-label">{item.label}</span>
                                    {item.badge && <span className="rail-badge">{item.badge}</span>}
                                </NavLink>
                            ))}
                        </div>
                    ))}
                </div>

                <button type="button" className="rail-actor" onClick={handleLogout} title={`Đăng xuất ${actorName}`}>
                    <span className="rail-avatar">{actorInitials}</span>
                    <span className="rail-actor-meta">
                        <span className="rail-actor-name">{actorName}</span>
                        <span className="rail-actor-role">{actorRole}</span>
                    </span>
                    <LogOut size={15} className="rail-logout-icon" />
                </button>
            </nav>

            {/* Cot noi dung */}
            <div className="app-main">
                <header className="page-header">
                    {title ? (
                        <div className="page-header-titles">
                            <h1 className="page-title">{title}</h1>
                        </div>
                    ) : <div />}
                    <div className="page-header-right">
                        <div className="poller-pill" title="Trạng thái poller RouterOS API">
                            <Radar size={13} className="poller-icon" />
                            <span>Poller 15s · 7/8 kết nối</span>
                        </div>
                        {headerActions}
                    </div>
                </header>

                <main className="page-body">
                    <HeaderActionsContext.Provider value={setHeaderActions}>
                        <Outlet />
                    </HeaderActionsContext.Provider>
                </main>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .app-shell {
                    display: flex;
                    gap: 16px;
                    padding: 16px;
                    min-height: 100vh;
                    background: var(--bg-color);
                    font-family: 'Inter', system-ui, sans-serif;
                }

                /* ---- Rail ---- */
                .rail {
                    width: 76px;
                    flex: none;
                    align-self: flex-start;
                    position: sticky;
                    top: 16px;
                    max-height: calc(100vh - 32px);
                    border-radius: 24px;
                    background: linear-gradient(180deg, #2a6f97 0%, #0d3352 100%);
                    box-shadow: 0 8px 24px -12px rgba(9, 38, 61, 0.5);
                    display: flex;
                    flex-direction: column;
                    align-items: stretch;
                    padding: 16px 12px 14px;
                    gap: 8px;
                    transition: width 0.22s ease;
                    overflow: hidden;
                }
                .rail-open .rail { width: 244px; }

                .rail-brand {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 0 2px 2px;
                    min-height: 40px;
                }
                .rail-brand-mark {
                    width: 40px;
                    height: 40px;
                    flex: none;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.14);
                    color: #bae6fd;
                    font-weight: 700;
                    font-size: 13px;
                    letter-spacing: 0.04em;
                }
                .rail-brand-text { display: none; flex-direction: column; line-height: 1.2; min-width: 0; }
                .rail-open .rail-brand-text { display: flex; }
                .rail-brand-name { color: #f8fafc; font-weight: 700; font-size: 14px; white-space: nowrap; }
                .rail-brand-sub { color: #7fb2d4; font-size: 9px; letter-spacing: 0.14em; white-space: nowrap; }

                .rail-toggle {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    width: 100%;
                    min-height: 36px;
                    padding: 8px 13px;
                    background: transparent;
                    border: none;
                    border-radius: 12px;
                    color: #9fcde8;
                    font-family: inherit;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background 0.15s ease, color 0.15s ease;
                }
                .rail-toggle:hover { background: rgba(255, 255, 255, 0.08); color: #f8fafc; }
                .rail-toggle svg { flex: none; }

                /* Danh sach muc — cuon rieng khi man hinh thap, khong lam ca rail dai ra */
                .rail-scroll {
                    flex: 1;
                    min-height: 0;
                    overflow-y: auto;
                    overflow-x: hidden;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
                }
                .rail-scroll::-webkit-scrollbar { width: 4px; }
                .rail-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.18); border-radius: 2px; }

                .rail-group { display: flex; flex-direction: column; gap: 2px; }
                /* Khi thu gon, nhan nhom thanh 1 duong ke mong — van con dau hieu phan nhom */
                .rail-group + .rail-group { margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.09); }
                .rail-group-label {
                    display: none;
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    color: #7fb2d4;
                    padding: 8px 13px 4px;
                    white-space: nowrap;
                }
                .rail-open .rail-group-label { display: block; }
                .rail-open .rail-group + .rail-group { border-top: none; padding-top: 0; margin-top: 2px; }

                .rail-item {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    /* 44px — nguong hit target toi thieu, giu nguyen ca khi thu gon */
                    min-height: 44px;
                    padding: 0 13px;
                    border-radius: 12px;
                    color: #9fcde8;
                    font-size: 13.5px;
                    font-weight: 500;
                    text-decoration: none;
                    white-space: nowrap;
                    transition: background 0.15s ease, color 0.15s ease;
                }
                .rail-item:hover { background: rgba(255, 255, 255, 0.08); color: #f8fafc; }
                .rail-item.active { background: #38bdf8; color: #0c3b5e; font-weight: 600; }
                .rail-item.active:hover { background: #38bdf8; color: #0c3b5e; }
                .rail-item:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 2px; }

                /* Thu gon: can giua icon trong o 52px. Mo rong: tra ve le trai co padding.
                   Do uu tien 0,1,0 -> 0,2,0 de quy tac mo rong thang. */
                .rail-item, .rail-toggle { justify-content: center; padding: 0; }
                .rail-brand { justify-content: center; }
                .rail-open .rail-item, .rail-open .rail-toggle { justify-content: flex-start; padding: 0 13px; }
                .rail-open .rail-brand { justify-content: flex-start; }
                .rail-icon { display: inline-flex; align-items: center; justify-content: center; width: 18px; flex: none; }

                .rail-label { display: none; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
                .rail-open .rail-label { display: block; }

                .rail-badge {
                    flex: none;
                    min-width: 18px;
                    height: 18px;
                    padding: 0 5px;
                    border-radius: 999px;
                    background: #ef4444;
                    color: #fff;
                    font-size: 10.5px;
                    font-weight: 700;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                /* Khi thu gon, badge nam de len goc icon; khi mo rong thi ve cuoi hang.
                   Do uu tien phai tang dan: 0,2,0 -> 0,3,0, neu khong quy tac "mo rong"
                   se khong bao gio thang. */
                .rail-item .rail-badge { position: absolute; top: 7px; right: 9px; }
                .rail-open .rail-item .rail-badge { position: static; }

                .rail-actor {
                    display: flex;
                    align-items: center;
                    gap: 11px;
                    width: 100%;
                    padding: 7px 8px;
                    margin-top: 4px;
                    background: transparent;
                    border: none;
                    border-radius: 14px;
                    cursor: pointer;
                    font-family: inherit;
                    text-align: left;
                    transition: background 0.15s ease;
                }
                .rail-actor:hover { background: rgba(255, 255, 255, 0.08); }
                .rail-avatar {
                    width: 36px;
                    height: 36px;
                    flex: none;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #7dd3fc;
                    color: #0c3b5e;
                    font-size: 12.5px;
                    font-weight: 700;
                }
                .rail-actor-meta { display: none; flex-direction: column; line-height: 1.25; min-width: 0; flex: 1; }
                .rail-open .rail-actor-meta { display: flex; }
                .rail-actor-name { color: #f8fafc; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .rail-actor-role { color: #7fb2d4; font-size: 11px; text-transform: capitalize; }
                .rail-logout-icon { display: none; flex: none; color: #9fcde8; }
                .rail-open .rail-logout-icon { display: block; }

                /* ---- Cot noi dung ---- */
                .app-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }

                .page-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 16px;
                    flex-wrap: wrap;
                    padding: 6px 4px 0;
                }
                .page-header-titles { min-width: 0; }
                .page-title {
                    font-size: 23px;
                    font-weight: 700;
                    color: var(--text-heading);
                    margin: 0;
                    letter-spacing: -0.015em;
                }
                .page-header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

                .poller-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    border-radius: 999px;
                    background: rgba(16, 185, 129, 0.1);
                    border: 1px solid rgba(16, 185, 129, 0.35);
                    color: #15803d;
                    font-size: 11.5px;
                    white-space: nowrap;
                }
                .poller-icon { animation: railRadarSpin 3s linear infinite; }
                @keyframes railRadarSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

                .page-body { min-height: 0; }

                /* Duoi 900px luon giu rail thu gon — 244px an mat qua nhieu chieu ngang */
                @media (max-width: 900px) {
                    .rail-open .rail { width: 76px; }
                    .rail-open .rail-brand-text,
                    .rail-open .rail-label,
                    .rail-open .rail-group-label,
                    .rail-open .rail-actor-meta,
                    .rail-open .rail-logout-icon { display: none; }
                    .rail-open .rail-item .rail-badge { position: absolute; top: 7px; right: 9px; }
                    .rail-open .rail-item, .rail-open .rail-toggle { justify-content: center; padding: 0; }
                    .rail-open .rail-brand { justify-content: center; }
                    .app-shell { padding: 12px; gap: 12px; }
                }

                @media (prefers-reduced-motion: reduce) {
                    .poller-icon { animation: none; }
                    .rail, .rail-item, .rail-toggle, .rail-actor { transition: none; }
                }
                `
            }} />
        </div>
    );
};
