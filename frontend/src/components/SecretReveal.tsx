import React from 'react';

type SecretRevealProps = {
    /** Dòng tiêu đề đậm, vd "RADIUS Secret — chỉ hiển thị 1 lần (env:...)"; có thể chứa JSX. */
    heading: React.ReactNode;
    value: string;
    copied: boolean;
    onCopy: () => void;
    /** Ghi chú nhỏ bên dưới, vd cảnh báo không xem lại được. */
    caption?: string;
    tone?: 'success' | 'info';
};

const TONE_PALETTE = {
    success: { background: '#f0fdf4', borderColor: '#86efac', text: '#166534' },
    info: { background: '#eff6ff', borderColor: '#bfdbfe', text: '#1e3a8a' },
} as const;

/**
 * Khối "hiện secret/key thật đúng 1 lần + nút sao chép" — dùng cho push API key và RADIUS secret
 * (2 nơi trở lên, DeviceDetail.tsx + Devices.tsx wizard). Trước đây mỗi nơi tự viết lại inline style,
 * lỡ dùng `.empty-state` (mặc định flex-direction: row — dành cho placeholder 1 dòng, không phải
 * khối nhiều dòng) khiến ô hiển thị secret co lại còn vài px khi tiêu đề chứa 1 chuỗi dài không có
 * khoảng trắng (vd credential_ref) — xem phase report. Gom về 1 component để sửa layout đúng
 * MỘT LẦN, không phải nhớ lặp lại `flexDirection`/`minWidth` ở từng nơi dùng mới sau này.
 */
export const SecretReveal: React.FC<SecretRevealProps> = ({ heading, value, copied, onCopy, caption, tone = 'success' }) => {
    const palette = TONE_PALETTE[tone];
    return (
        <div className="token-reveal-box" style={{ background: palette.background, borderColor: palette.borderColor }}>
            <strong style={{ color: palette.text }}>{heading}</strong>
            <div className="token-reveal-row">
                <code>{value}</code>
                <button type="button" className={`button-secondary compact-button${copied ? ' copied-pop' : ''}`} onClick={onCopy}>{copied ? 'Đã chép ✓' : 'Sao chép'}</button>
            </div>
            {caption && <p style={{ margin: 0, fontSize: 12, color: palette.text }}>{caption}</p>}
        </div>
    );
};
