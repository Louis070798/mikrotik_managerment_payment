import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DefaultService } from '../api';
import { Anchor } from 'lucide-react';

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
                // Chua co Auth/RBAC that (xem backend/src/libs/auth-stub/auth-stub.guard.ts) —
                // '*' la wildcard duoc AuthStubGuard chap nhan cho moi permission.
                localStorage.setItem('permissions', '*');
                navigate('/');
            } else {
                setError('Invalid login response');
            }
        } catch {
            setError('Invalid credentials or network error.');
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
