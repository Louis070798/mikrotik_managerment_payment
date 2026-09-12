import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { bytesToRateBps, pickByteUnit, type DashboardGranularity } from '../lib/dashboard';

export type VolumePoint = {
    bucket?: string;
    download_bytes?: number | null;
    upload_bytes?: number | null;
};

type Props = {
    points: VolumePoint[];
    granularity: DashboardGranularity;
    /** Nhãn trục thời gian ngắn (giờ:phút) khi khoảng xem hẹp, dài (ngày/giờ) khi khoảng xem rộng. */
    compactTimeLabel?: boolean;
};

/**
 * Cặp biểu đồ dùng chung cho MỌI nơi có dữ liệu byte thật theo bucket thời gian (WAN reconciliation
 * timeseries cấp tàu, traffic cấp thiết bị...) — 1 biểu đồ CỘT thể hiện lượng data tiêu thụ (byte
 * thật, download/upload xếp chồng theo từng bucket) + 1 biểu đồ LINE thể hiện tốc độ (bit/s thật,
 * suy ra từ byte delta thật ÷ độ dài bucket qua bytesToRateBps() đã có sẵn — không phải số bịa).
 * Không tự vẽ gì nếu không có điểm nào (points rỗng) — tránh 1 khung biểu đồ trống vô nghĩa.
 */
export const VolumeSpeedChart: React.FC<Props> = ({ points, granularity, compactTimeLabel }) => {
    const rows = useMemo(() => points.map(p => ({
        time: p.bucket ? new Date(p.bucket).toLocaleString('vi-VN', compactTimeLabel ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit' }) : '',
        download_bytes: p.download_bytes ?? 0,
        upload_bytes: p.upload_bytes ?? 0,
        download_mbps: (bytesToRateBps(p.download_bytes ?? 0, granularity) ?? 0) / 1_000_000,
        upload_mbps: (bytesToRateBps(p.upload_bytes ?? 0, granularity) ?? 0) / 1_000_000,
    })), [points, granularity, compactTimeLabel]);

    const unit = useMemo(() => pickByteUnit(Math.max(1, ...rows.map(r => r.download_bytes + r.upload_bytes))), [rows]);
    const volumeRows = useMemo(() => rows.map(r => ({ ...r, download_scaled: r.download_bytes / unit.divisor, upload_scaled: r.upload_bytes / unit.divisor })), [rows, unit]);

    if (rows.length === 0) return null;

    return (
        <div style={{ display: 'grid', gap: 22 }}>
            <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Lượng data tiêu thụ theo thời gian ({unit.label} / bucket)</div>
                <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={volumeRows}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="time" fontSize={11} />
                            <YAxis fontSize={11} unit={` ${unit.label}`} />
                            <Tooltip formatter={(v: number) => `${Number(v).toFixed(2)} ${unit.label}`} />
                            <Legend />
                            <Bar dataKey="download_scaled" name="Download" stackId="volume" fill="#009688" />
                            <Bar dataKey="upload_scaled" name="Upload" stackId="volume" fill="#3b82f6" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Tốc độ theo thời gian (Mbps — suy từ byte thật ÷ độ dài bucket)</div>
                <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rows}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="time" fontSize={11} />
                            <YAxis fontSize={11} unit=" Mbps" />
                            <Tooltip formatter={(v: number) => `${Number(v).toFixed(2)} Mbps`} />
                            <Legend />
                            <Line type="monotone" dataKey="download_mbps" name="Download" stroke="#009688" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="upload_mbps" name="Upload" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
