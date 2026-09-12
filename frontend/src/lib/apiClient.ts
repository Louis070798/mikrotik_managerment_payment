import axios from 'axios';

/**
 * Generated services (src/api/services/*.ts) always set the
 * 'x-actor-permissions' header key on every call — even when the caller
 * doesn't pass xActorPermissions, it's set to `undefined`. Because
 * getHeaders() in src/api/core/request.ts merges
 * { ...additionalHeaders, ...options.headers }, that per-call undefined
 * always wins over a global OpenAPI.HEADERS resolver and the key gets
 * stripped before the request is sent. An axios interceptor is the only
 * place that can reliably attach the header for every request.
 *
 * NÂNG CẤP 2026-09-07 (xem backend/src/modules/auth/auth.service.ts): POST /auth/login giờ trả
 * permissions THẬT theo vai trò đăng nhập ('*' cho admin, danh sách hẹp hơn cho tenant) — Login.tsx
 * lưu đúng giá trị đó vào localStorage['permissions']. KHÔNG còn ghi đè cứng '*' ở đây nữa (làm vậy
 * sẽ vô hiệu hoá hoàn toàn giới hạn quyền của tenant) — chỉ dùng '*' làm phương án dự phòng cho
 * phiên cũ từ trước khi có thay đổi này (localStorage chưa từng có giá trị 'permissions' thật).
 */
axios.interceptors.request.use(config => {
    if (!config.headers['x-actor-permissions']) {
        if (localStorage.getItem('token')) {
            const stored = localStorage.getItem('permissions');
            config.headers['x-actor-permissions'] = stored && stored.length > 0 ? stored : '*';
        }
    }
    // GET /auth/me giải mã danh tính THẬT từ token qua header Authorization -- không có header
    // này, /auth/me luôn trả về danh tính admin mặc định (xem AuthService.me()).
    if (!config.headers['Authorization']) {
        const token = localStorage.getItem('token');
        if (token) config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
});
