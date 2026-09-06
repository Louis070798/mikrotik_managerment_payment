/**
 * Bảng tĩnh hậu tố tên miền -> tên dịch vụ (tài liệu tham khảo mục 6.1: khớp hậu tố đầu tiên
 * thắng). Khởi đầu nhỏ, mở rộng sau chỉ cần thêm dòng vào đây — không đổi logic phân loại.
 * KHÔNG tách nhánh con (Drive/Photos/Gmail...) trong Phase A, chỉ nhóm theo thương hiệu lớn.
 */
const SERVICE_SUFFIXES: Array<{ app: string; suffixes: string[] }> = [
  { app: 'YouTube', suffixes: ['youtube.com', 'googlevideo.com', 'ytimg.com'] },
  { app: 'TikTok', suffixes: ['tiktok.com', 'tiktokcdn.com', 'tiktokv.com', 'muscdn.com'] },
  { app: 'Facebook/Instagram', suffixes: ['facebook.com', 'fbcdn.net', 'instagram.com', 'cdninstagram.com', 'whatsapp.com', 'whatsapp.net'] },
  { app: 'Google', suffixes: ['google.com', 'gstatic.com', 'googleapis.com', 'googleusercontent.com', '1e100.net'] },
  { app: 'Apple', suffixes: ['apple.com', 'icloud.com', 'mzstatic.com', 'apple-dns.net'] },
  { app: 'Microsoft', suffixes: ['microsoft.com', 'windowsupdate.com', 'live.com', 'office.com', 'office365.com'] },
];

/** Khớp domain vào tên dịch vụ theo hậu tố — domain không khớp gì trả về null (gọi là "Khác" ở tầng trên). */
export function classifyDomainToApp(domain: string): string | null {
  const lower = domain.toLowerCase();
  for (const { app, suffixes } of SERVICE_SUFFIXES) {
    if (suffixes.some((suffix) => lower === suffix || lower.endsWith(`.${suffix}`))) return app;
  }
  return null;
}
