import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DefaultService } from '../api';
import { Anchor } from 'lucide-react';
import { getApiErrorInfo } from '../lib/dashboard';

export const Login: React.FC = () => {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await DefaultService.postAuthLogin({ requestBody: { username, password } });

            if (res.data?.token) {
                localStorage.setItem('token', res.data.token);
                // Quyen THAT theo vai tro dang nhap (xem backend/src/modules/auth/auth.service.ts) —
                // '*' cho admin (gom ca fallback khi username khong khop tenant nao), danh sach hep
                // hon cho tenant.
                localStorage.setItem('permissions', res.data.permissions ?? '*');
                localStorage.setItem('role', res.data.role ?? 'admin');
                localStorage.setItem('actorName', res.data.name ?? '');
                navigate('/');
            } else {
                setError('Phản hồi đăng nhập không hợp lệ — thiếu token.');
            }
        } catch (requestError) {
            // Hien dung thong bao that tu backend (vd "Sai username hoặc mật khẩu." — xem
            // AuthService.login(), tra ve khi username khong ton tai HOAC ton tai nhung sai mat
            // khau, cung 1 thong bao cho ca 2 truong hop de khong lo username nao co that trong
            // he thong) thay vi 1 chuoi chung chung khong phan biet duoc loi mang voi sai mat khau.
            setError(getApiErrorInfo(requestError).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-box glass-panel">
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <Anchor size={48} color="#3b82f6" style={{ marginBottom: '1rem' }} />
                    <h2>Fleet Login</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Sign in to manage MikroTik devices</p>
                </div>

                {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
                        {error}
                    </div>
                )}

                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label>Username</label>
                        <input
                            type="text"
                            className="input-field"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <input
                            type="password"
                            className="input-field"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                        {loading ? <div className="loading-spinner" /> : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
};
