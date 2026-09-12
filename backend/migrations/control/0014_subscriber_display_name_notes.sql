-- Theo mockup UI "quan ly Hotspot user" nguoi dung cung cap -- them 2 truong thong tin thuan tuy
-- hien thi (khong anh huong RADIUS/xac thuc that): display_name (ten hien thi/ho ten, khac
-- username dang nhap) va notes (ghi chu tu do cua admin, vd "khach tham quan trong ngay").
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "display_name" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "notes" text;
