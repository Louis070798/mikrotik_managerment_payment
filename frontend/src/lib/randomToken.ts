/**
 * Sinh chuoi hex ngau nhien phia CLIENT (Web Crypto, khong phai Node crypto) -- chi de GOI Y 1 gia
 * tri manh vao o nhap cho admin xem/sua truoc khi bam "Luu" (van la admin xac nhan gia tri cuoi
 * cung gui len server, KHONG phai server tu sinh va giu bi mat nhu truoc day). Dung cho push API
 * key / RADIUS secret cua thiet bi -- 2 loai token may-doi-may, khac mat khau dang nhap cua
 * nguoi dung (khong can de admin tu nghi 1 chuoi "manh" tu tay).
 */
export function generateRandomHex(byteLength: number): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
