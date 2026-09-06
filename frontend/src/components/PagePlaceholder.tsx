
import { Settings, Hammer } from 'lucide-react';

export const PagePlaceholder = ({ title, description }: { title: string, description?: string }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '60vh', fontFamily: '"Inter", sans-serif' }}>
            <div style={{
                background: '#fff',
                borderRadius: '16px',
                padding: '40px',
                border: '1px solid #e2e8f0',
                textAlign: 'center',
                maxWidth: '480px',
                boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px'
            }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    background: '#f1f5f9',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '8px'
                }}>
                    <Hammer size={32} color="#3b82f6" />
                </div>

                <h2 style={{ color: '#0f172a', margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{title}</h2>
                <p style={{ color: '#64748b', margin: 0, fontSize: '15px', lineHeight: '1.5' }}>
                    {description || 'Tính năng này đang trong quá trình phát triển và sẽ sớm ra mắt ở các phiên bản tiếp theo. Vui lòng quay lại sau!'}
                </p>

                <div style={{ marginTop: '16px' }}>
                    <button style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        color: '#475569',
                        padding: '10px 20px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'not-allowed'
                    }}>
                        <Settings size={16} /> Đang xây dựng...
                    </button>
                </div>
            </div>
        </div>
    );
};
