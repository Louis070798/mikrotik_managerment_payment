import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { pickByteUnit } from '../lib/dashboard';

export type CategoryVolumeItem = { label: string; bytes: number | null | undefined };

type Props = {
    items: CategoryVolumeItem[];
    barColor?: string;
    /** Chiều cao khung vẽ — mặc định 220px, thu gọn hơn khi nhúng trong danh sách dài (vd Users). */
    height?: number;
};

/**
 * Biểu đồ cột so sánh lượng data tiêu thụ GIỮA CÁC MỤC (zone/tàu/user...) — khác VolumeSpeedChart
 * (theo bucket THỜI GIAN của 1 thực thể). Bỏ qua mục nào bytes=null (chưa có dữ liệu thật) thay vì
 * vẽ thành cột 0 — 1 cột 0 giả có thể bị đọc nhầm là "đã đo được, bằng 0".
 */
export const CategoryVolumeBarChart: React.FC<Props> = ({ items, barColor = '#009688', height = 220 }) => {
    const known = items.filter((item): item is { label: string; bytes: number } => item.bytes !== null && item.bytes !== undefined);
    const unit = useMemo(() => pickByteUnit(Math.max(1, ...known.map(item => item.bytes))), [known]);
    const rows = known.map(item => ({ label: item.label, scaled: item.bytes / unit.divisor }));

    if (rows.length === 0) return null;

    return (
        <div style={{ width: '100%', height }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={11} interval={0} angle={rows.length > 6 ? -25 : 0} textAnchor={rows.length > 6 ? 'end' : 'middle'} height={rows.length > 6 ? 46 : 24} />
                    <YAxis fontSize={11} unit={` ${unit.label}`} />
                    <Tooltip formatter={(v: number) => `${Number(v).toFixed(2)} ${unit.label}`} />
                    <Bar dataKey="scaled" fill={barColor} radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
