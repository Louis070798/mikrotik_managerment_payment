-- Ten thanh vien ZeroTier (Node ID) -- controller ZeroTier THAT khong co field "name" cho member
-- (chi network moi co ten that). Bang nay la alias rieng cua he thong nay, giong cach zero-ui va
-- cac UI ZeroTier khac van lam -- KHONG gui len controller, chi hien thi/tra ve tu DB nay.
CREATE TABLE IF NOT EXISTS "zerotier_member_labels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "network_id" text NOT NULL,
  "member_id" text NOT NULL,
  "label" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "zerotier_member_labels_network_member_uq" ON "zerotier_member_labels" ("network_id", "member_id");
