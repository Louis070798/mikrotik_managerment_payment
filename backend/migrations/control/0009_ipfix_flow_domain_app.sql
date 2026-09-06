-- Bo phan loai DNS (tang 1/2, xem dns-resolution-cache/) can 2 cot moi de luu ket qua that: ten
-- mien da khop (neu co) va ten dich vu suy ra tu service-catalog.ts. classification_method van la
-- nguon su that ve PHUONG PHAP (DNS/UNKNOWN/...); domain/app la KET QUA cua phuong phap do, tach
-- rieng de khong lan "khong biet domain" voi "biet domain nhung khong khop catalog nao" (app=NULL
-- + method=DNS trong truong hop do, dung nhu classifier.ts).

ALTER TABLE "ipfix_flow_records" ADD COLUMN IF NOT EXISTS "domain" text;--> statement-breakpoint
ALTER TABLE "ipfix_flow_records" ADD COLUMN IF NOT EXISTS "app" text;
