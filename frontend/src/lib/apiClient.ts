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
 */
axios.interceptors.request.use(config => {
    if (!config.headers['x-actor-permissions']) {
        // TAM THOI (xem backend/src/modules/auth/auth.controller.ts +
        // libs/auth-stub/auth-stub.guard.ts): AuthController.login() nhan bat ky
        // username/password nao va khong gan quyen theo vai tro that -- khong co RBAC that o
        // giai doan nay nen '*' la quyen hop le DUY NHAT cho moi phien dang nhap. Luon ghi de
        // '*' o day (khong doc lai gia tri cu trong localStorage) de tu phuc hoi neu key
        // 'permissions' tung bi ghi thanh 1 danh sach hep hon tu lan test truoc -- 1 gia tri cu
        // sai se lam FORBIDDEN moi trang ghi du lieu (vd ZeroTier tao/sua/xoa) ma khong ro ly do.
        if (localStorage.getItem('token')) {
            localStorage.setItem('permissions', '*');
            config.headers['x-actor-permissions'] = '*';
        }
    }
    return config;
});
