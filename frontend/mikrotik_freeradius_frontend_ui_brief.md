# MikroTik + FreeRADIUS Hotspot User Management
## Frontend UI Implementation Brief for Claude Code

> **MỤC TIÊU:** Xây dựng giao diện web quản lý user Hotspot sử dụng MikroTik + FreeRADIUS theo layout admin dashboard.
>
> **QUAN TRỌNG:** Backend và API **đã có sẵn / sẽ được xử lý riêng**. Nhiệm vụ của bạn là **code frontend UI hoàn chỉnh**, tổ chức component, state, validation, loading/error states và tích hợp vào các API hiện có.
>
> **KHÔNG tự thiết kế lại backend. KHÔNG tự dựng database. KHÔNG tự thay đổi business logic phía server. KHÔNG tự tạo API mới nếu chưa được yêu cầu.**
>
> Nếu API hiện tại chưa khớp 100% với UI, hãy tạo **adapter/service layer ở frontend** để ánh xạ response → view model thay vì sửa backend.

---

# 1. Phạm vi công việc

Xây dựng frontend cho hệ thống quản lý Hotspot User với các nhóm chức năng:

- Dashboard tổng quan
- Danh sách user
- Tạo user
- Sửa user
- Xóa user
- Khóa / mở khóa user
- Gia hạn tài khoản
- Đổi mật khẩu
- Đổi gói cước
- Reset dung lượng / thời gian sử dụng
- Import user hàng loạt
- Export user
- Quản lý nhóm user
- Quản lý gói cước
- Quản lý RADIUS profile
- Xem user online
- Xem phiên đăng nhập
- Xem lịch sử truy cập
- Xem lưu lượng upload/download
- Xem IP/MAC/device
- Báo cáo thống kê
- Cấu hình hệ thống frontend
- Quản trị quyền truy cập frontend nếu API đã hỗ trợ

---

# 2. Nguyên tắc quan trọng khi code

## 2.1 Frontend only

Frontend chịu trách nhiệm:

- Hiển thị dữ liệu
- Filter / sort / pagination
- Form validation
- Dialog / modal
- Loading state
- Empty state
- Error state
- Confirmation state
- Mapping dữ liệu API
- Cache dữ liệu hợp lý
- Refresh dữ liệu
- Search debounce
- Responsive layout
- Notification / toast
- Authentication UI nếu endpoint auth đã có

Frontend **không chịu trách nhiệm**:

- Xác thực RADIUS thực tế
- Gửi Access-Request đến FreeRADIUS
- Logic MikroTik RouterOS
- Accounting packet
- Database schema thực tế
- SQL query server
- Tạo token backend
- Phân quyền server-side
- Rate-limit thực tế
- Session enforcement thực tế
- Kick user trực tiếp nếu backend chưa có endpoint tương ứng

---

# 3. Stack frontend đề xuất

Nếu project chưa khóa stack, ưu tiên:

- React
- TypeScript
- Vite hoặc Next.js tùy project hiện tại
- Tailwind CSS
- shadcn/ui hoặc component library hiện có
- TanStack Query cho server state
- TanStack Table cho bảng
- React Hook Form
- Zod
- Lucide Icons
- Recharts nếu cần biểu đồ
- date-fns

Nếu project hiện tại đã có stack khác thì **giữ nguyên stack hiện tại**, không migration toàn bộ project chỉ để làm màn hình này.

---

# 4. Layout tổng thể

Giao diện desktop theo dạng Admin Dashboard.

Cấu trúc:

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Sidebar │ Topbar                                                        │
│         ├────────────────────────────────────────────────────────────────┤
│         │ KPI Cards                                                      │
│         ├────────────────────────────────────────────────────────────────┤
│         │ User Management Header + Actions                               │
│         ├────────────────────────────────────────────────────────────────┤
│         │ Search + Filter                                                │
│         ├────────────────────────────────────────────────────────────────┤
│         │ User Table                                                     │
│         ├────────────────────────────────────────────────────────────────┤
│         │ Selected User Detail                                           │
│         │ ├─ User Info                                                   │
│         │ └─ Usage / Session / RADIUS / Activity                         │
│         └────────────────────────────────────────────────────────────────┘
```

---

# 5. Visual direction

## 5.1 Phong cách

- SaaS admin dashboard hiện đại
- Nền chính trắng / xám rất nhạt
- Sidebar navy đậm
- Accent chính xanh dương
- Border nhẹ
- Card radius khoảng 10–14px
- Shadow nhẹ
- Typography rõ ràng, ưu tiên khả năng đọc
- Tránh hiệu ứng màu mè
- Mật độ thông tin vừa phải
- Hỗ trợ màn hình vận hành 24/7

## 5.2 Màu trạng thái

Dùng semantic color, không hardcode logic bằng màu duy nhất.

Ví dụ:

```text
Online        → green
Active        → green
Offline       → gray
Expired       → orange/red
Disabled      → red
Suspended     → amber
Error         → red
Processing    → blue
```

## 5.3 Responsive

Desktop là ưu tiên.

Breakpoint gợi ý:

```text
>= 1440px   full dashboard
1024–1439   compact sidebar
768–1023    collapsed sidebar + horizontal scroll table
< 768       mobile layout, table chuyển card/list nếu cần
```

---

# 6. Sidebar

Sidebar cố định bên trái.

## Menu

```text
Tổng quan

Người dùng
  ├─ Danh sách user
  ├─ Tạo user
  └─ Nhập hàng loạt

Nhóm gói cước

Gói cước

Profile RADIUS

Thiết bị

Phiên đăng nhập

Báo cáo

Cài đặt

Hệ thống

Trợ giúp
```

## Yêu cầu

- Active menu rõ ràng
- Menu group collapse/expand
- Responsive collapse
- Tooltip khi collapsed
- Icon cho từng menu
- Route active dựa trên URL
- Không hardcode route trong nhiều component; dùng menu config

Ví dụ:

```ts
type NavigationItem = {
  label: string;
  icon?: React.ReactNode;
  path?: string;
  children?: NavigationItem[];
};
```

---

# 7. Topbar

Topbar gồm:

- Hamburger toggle sidebar
- Tên hệ thống:
  `Hệ thống quản lý Hotspot (MikroTik + FreeRADIUS)`
- Notification icon
- User avatar
- Tên admin
- Dropdown account

Dropdown:

```text
Thông tin tài khoản
Đổi mật khẩu
Đăng xuất
```

Nếu backend chưa có notification endpoint thì dùng placeholder UI nhưng không fake dữ liệu production.

---

# 8. Dashboard KPI Cards

Hiển thị 4 card:

### Card 1
**Tổng người dùng**

- total users
- trend nếu API có

### Card 2
**Đang online**

- online users
- percentage

### Card 3
**Đã hết hạn**

- expired users

### Card 4
**Tổng lưu lượng**

- total traffic
- format KB / MB / GB / TB

Ví dụ ViewModel:

```ts
type DashboardStats = {
  totalUsers: number;
  onlineUsers: number;
  expiredUsers: number;
  totalTrafficBytes: number;
};
```

Không yêu cầu backend phải trả đúng format trên.
Adapter frontend có thể map từ response hiện tại.

---

# 9. Trang Danh sách User

Đây là màn hình trung tâm.

## Header

```text
Danh sách người dùng
Quản lý tài khoản hotspot được lưu trữ / xác thực qua hệ thống FreeRADIUS
```

## Action buttons

```text
+ Tạo user
Nhập (Import)
Xuất (Export)
...
```

Menu `...` có thể chứa:

```text
Refresh
Bulk disable
Bulk enable
Bulk delete
Reset filter
```

Chỉ enable action nếu backend API tương ứng tồn tại.

---

# 10. Search & Filter

Thanh filter gồm:

### Search

Search theo các field nếu backend hỗ trợ:

```text
username
full_name
email
phone
room
department
MAC
IP
```

Placeholder:

```text
Tìm username, tên, email, phone...
```

### Filter Group

```text
Tất cả nhóm
Khách lẻ
Khách lưu trú
Nhân viên
VIP
...
```

### Filter Status

```text
Tất cả trạng thái
Online
Offline
Active
Expired
Disabled
```

### Date range

Dùng date range picker.

Có thể lọc theo:

- created_at
- expired_at
- last_login

Tùy API hiện tại.

---

# 11. User Table

Các cột ưu tiên:

```text
Checkbox
#
Username
Tên người dùng
Nhóm
Gói cước
Thời hạn
Lưu lượng
Trạng thái
Thao tác
```

## Row interaction

- Click row → chọn user
- Selected row có highlight
- Không trigger selection khi click action button

## Action icon

```text
View
Edit
Disable / Enable
Delete
```

Có tooltip.

## Pagination

Footer bảng:

```text
Hiển thị 1–20 / 1,245 người dùng
```

Pagination:

```text
Previous
1 2 3 4 5 ...
Next
```

Ưu tiên **server-side pagination** nếu API đã support.

---

# 12. User Status Badge

Các status cần hỗ trợ ở UI:

```ts
type UserStatus =
  | "active"
  | "online"
  | "offline"
  | "expired"
  | "disabled"
  | "suspended";
```

Badge component:

```tsx
<UserStatusBadge status={user.status} />
```

Không viết status badge logic lặp lại ở nhiều nơi.

---

# 13. Selected User Detail

Khi chọn user, hiển thị khu vực chi tiết ở dưới bảng hoặc panel bên phải.

Desktop theo layout:

```text
┌─────────────────────┬────────────────────────────────────────┐
│ Thông tin người dùng│ Tabs                                   │
│                     │ Traffic | RADIUS | Activity            │
└─────────────────────┴────────────────────────────────────────┘
```

---

# 14. Form Thông tin User

Các field:

```text
Username
Tên hiển thị
Password
Nhóm
Gói cước
Thời hạn
Trạng thái
MAC address
Ghi chú
```

Optional nếu API có:

```text
Email
Phone
Room
Department
Device limit
Static IP
VLAN
```

## Password

- Không hiển thị password cũ từ API
- Nếu API chỉ cho reset password, button `Đổi mật khẩu`
- Có show/hide password cho input mới
- Validation frontend

---

# 15. Tabs chi tiết User

Các tab:

```text
Lưu lượng & phiên đăng nhập
Thuộc tính RADIUS
Lịch sử hoạt động
```

---

# 16. Tab Lưu lượng & Phiên đăng nhập

Summary cards:

```text
Download
Upload
Thời gian online
Thiết bị
```

Ví dụ:

```text
Download: 320 MB
Upload: 192 MB
Online: 00:45:12
Device: 1 thiết bị
```

---

# 17. Recent Sessions Table

Columns:

```text
#
Thời gian
IP cấp phát
MAC
Thiết bị
Trạng thái
```

Có thể bổ sung:

```text
Login time
Logout time
Session duration
NAS
AP
Terminate cause
Input bytes
Output bytes
```

Nếu API có dữ liệu.

---

# 18. Tab Thuộc tính RADIUS

Hiển thị key/value.

Ví dụ:

```text
Mikrotik-Rate-Limit
Session-Timeout
Idle-Timeout
Simultaneous-Use
Framed-IP-Address
Framed-Pool
Filter-Id
VLAN
```

UI dạng table:

```text
Attribute             Operator     Value
Mikrotik-Rate-Limit   :=           10M/10M
Session-Timeout       :=           3600
```

Cho phép edit chỉ khi endpoint tương ứng có sẵn.

---

# 19. Tab Lịch sử hoạt động

Timeline hoặc table.

Ví dụ event:

```text
Created user
Changed password
Changed package
Extended expiration
Disabled user
Enabled user
Login
Logout
Reset quota
Admin update
```

Fields:

```text
time
action
actor
description
ip
```

---

# 20. Tạo User

Route gợi ý:

```text
/users/create
```

Form:

```text
Username *
Password *
Display name
Group
Package *
Expiration
MAC
Notes
```

Optional:

```text
Email
Phone
Room
Department
Static IP
VLAN
```

Buttons:

```text
Tạo tài khoản
Tạo & tiếp tục
Hủy
```

Sau success:

- toast
- invalidate user list query
- chuyển về user detail hoặc user list

---

# 21. Chỉnh sửa User

Không reuse form theo kiểu copy-paste.

Nên dùng component:

```tsx
<UserForm mode="create" />
<UserForm mode="edit" user={user} />
```

---

# 22. Delete User

Phải có confirmation dialog.

Ví dụ:

```text
Xóa tài khoản guest001?

Hành động này có thể làm user không còn truy cập được hệ thống.

[Hủy] [Xóa user]
```

Không delete ngay khi click icon.

---

# 23. Disable / Enable User

Confirmation nhẹ.

Sau success:

- update badge
- invalidate detail
- invalidate list
- toast success

---

# 24. Gia hạn tài khoản

Modal:

```text
Gia hạn user

Hiện tại:
12/09/2026 14:30

Gia hạn đến:
[date time picker]

Hoặc:
+1 ngày
+7 ngày
+30 ngày
```

Backend quyết định logic thực tế.

---

# 25. Đổi gói cước

Modal:

```text
Gói hiện tại
ROOM_3D

Gói mới
[select package]

Áp dụng ngay
Áp dụng phiên đăng nhập tiếp theo
```

Chỉ hiển thị các lựa chọn mà backend hỗ trợ.

---

# 26. Reset quota / usage

Modal:

```text
Reset dung lượng user?

Download used
Upload used
Session time
```

Có checkbox nếu API cho reset từng loại:

```text
[x] Data usage
[x] Session time
```

---

# 27. Import User

Trang / modal upload.

Hỗ trợ frontend:

```text
CSV
XLSX
```

Nếu API chỉ nhận CSV thì frontend chỉ gửi CSV.

UI:

```text
Upload file
Preview records
Validate records
Show error per row
Import
```

Preview table:

```text
Row
Username
Package
Expiration
Status
Error
```

Không gửi file nếu validation cơ bản fail.

---

# 28. Export User

UI cho phép chọn:

```text
Current page
Filtered records
Selected users
All users
```

Format tùy API:

```text
CSV
Excel
PDF
```

Nếu backend chỉ support CSV/XLSX thì không fake PDF.

---

# 29. Nhóm User

Trang:

```text
/user-groups
```

Fields:

```text
name
description
default_package
status
user_count
```

UI:

- table
- create
- edit
- delete nếu endpoint có

---

# 30. Gói cước

Trang:

```text
/packages
```

Package fields UI:

```text
Tên gói
Mã gói
Download rate
Upload rate
Data quota
Time quota
Validity
Price
Concurrent devices
RADIUS profile
Status
```

Ví dụ:

```text
1H_50K
1 giờ / 50.000đ
10 Mbps
10 Mbps
Unlimited
1 hour
1 day
1 device
```

UI không tự enforce giới hạn.
Backend + RADIUS chịu trách nhiệm enforce.

---

# 31. RADIUS Profile

Trang:

```text
/radius-profiles
```

Hiển thị:

```text
Profile name
Description
Rate limit
Session timeout
Idle timeout
Simultaneous use
VLAN
IP pool
Attributes
Status
```

---

# 32. Phiên đăng nhập

Route:

```text
/sessions
```

Tabs:

```text
Online
History
```

Online table:

```text
Username
IP
MAC
Device
NAS
Login time
Online duration
Download
Upload
Action
```

Action có thể có:

```text
View
Disconnect
```

**Chỉ hiển thị Disconnect nếu backend có endpoint hỗ trợ kick session.**

---

# 33. Báo cáo

Route:

```text
/reports
```

Widgets:

```text
Total users
Online users
New users
Expired users
Traffic
Session count
Average session duration
Top users by traffic
Top packages
```

Charts gợi ý:

```text
Traffic over time
Online users over time
Package distribution
Top bandwidth users
```

---

# 34. Empty / Loading / Error State

Mọi màn hình server data đều phải có:

## Loading

- Skeleton
- Button disable khi submitting

## Empty

Ví dụ:

```text
Chưa có người dùng nào.
Tạo user đầu tiên để bắt đầu.
```

## Error

Ví dụ:

```text
Không thể tải danh sách user.

[Thử lại]
```

Không show raw stack trace.

---

# 35. Toast / Notification

Success:

```text
Tạo user thành công
Cập nhật user thành công
Đã khóa tài khoản
Đã gia hạn tài khoản
```

Error:

```text
Không thể cập nhật user
Username đã tồn tại
Không thể kết nối hệ thống
```

Prefer message trả từ API nếu an toàn để hiển thị.

---

# 36. API Integration Rules

## Rất quan trọng

**API đã có sẵn.**

Không tự tạo backend endpoint giả định rồi yêu cầu backend sửa theo frontend.

Thay vào đó:

1. Kiểm tra API service / Swagger / OpenAPI / source hiện có.
2. Xác định endpoint thực tế.
3. Tạo frontend service layer.
4. Map DTO → ViewModel.
5. UI chỉ sử dụng ViewModel.

Ví dụ:

```ts
// Backend DTO - shape thực tế có thể khác
type ApiUserDto = {
  user_id: number;
  username: string;
  group_name?: string;
  profile_name?: string;
  expired_at?: string;
  is_enabled?: boolean;
};

// Frontend ViewModel
type UserViewModel = {
  id: string;
  username: string;
  groupName: string;
  packageName: string;
  expiration: Date | null;
  status: UserStatus;
};
```

Mapping:

```ts
function mapUser(dto: ApiUserDto): UserViewModel {
  return {
    id: String(dto.user_id),
    username: dto.username,
    groupName: dto.group_name ?? "-",
    packageName: dto.profile_name ?? "-",
    expiration: dto.expired_at ? new Date(dto.expired_at) : null,
    status: dto.is_enabled ? "active" : "disabled",
  };
}
```

---

# 37. Service Layer

Tạo module dạng:

```text
src/
  api/
    client.ts
    users.api.ts
    packages.api.ts
    sessions.api.ts
    radius.api.ts
    reports.api.ts
```

UI component không gọi `fetch()` trực tiếp.

Ví dụ:

```ts
export const usersApi = {
  list,
  detail,
  create,
  update,
  remove,
  enable,
  disable,
  extend,
  resetUsage,
};
```

Các method thực tế phải map vào API hiện có.

---

# 38. Query Keys

Nếu dùng TanStack Query:

```ts
const queryKeys = {
  users: {
    all: ["users"] as const,
    list: (filters: UserFilters) => ["users", "list", filters] as const,
    detail: (id: string) => ["users", "detail", id] as const,
  },

  packages: {
    all: ["packages"] as const,
  },

  sessions: {
    online: ["sessions", "online"] as const,
  },
};
```

---

# 39. Type definitions

Tạo types frontend rõ ràng.

```ts
export type User = {
  id: string;
  username: string;
  displayName?: string;
  groupId?: string;
  groupName?: string;
  packageId?: string;
  packageName?: string;

  status: UserStatus;

  expiresAt?: string | null;

  downloadBytes?: number;
  uploadBytes?: number;
  totalBytes?: number;

  sessionTimeSeconds?: number;

  ipAddress?: string;
  macAddress?: string;

  lastLoginAt?: string | null;

  notes?: string;
};
```

Không bắt backend phải trả object này trực tiếp.

---

# 40. Utility formatting

Tạo utility chung.

```ts
formatBytes()
formatDuration()
formatDateTime()
formatDate()
formatRate()
```

Ví dụ:

```ts
formatBytes(1288490188)
// 1.20 GB

formatDuration(2712)
// 45m 12s
```

---

# 41. Table Architecture

Nên tách:

```text
UserTable
UserTableToolbar
UserTablePagination
UserTableRowActions
UserStatusBadge
```

Tránh file component dài hàng nghìn dòng.

---

# 42. Component Structure

Gợi ý:

```text
src/
  components/
    layout/
      AppSidebar.tsx
      AppTopbar.tsx
      PageContainer.tsx

    users/
      UserTable.tsx
      UserTableToolbar.tsx
      UserForm.tsx
      UserDetailPanel.tsx
      UserStatusBadge.tsx
      UserSessionTable.tsx
      UserTrafficCards.tsx

    packages/
      PackageTable.tsx
      PackageForm.tsx

    radius/
      RadiusAttributeTable.tsx

    common/
      ConfirmDialog.tsx
      EmptyState.tsx
      ErrorState.tsx
      LoadingSkeleton.tsx
      StatCard.tsx
```

---

# 43. Pages

Gợi ý routes:

```text
/dashboard

/users
/users/create
/users/:id
/users/:id/edit

/user-groups

/packages

/radius-profiles

/sessions

/reports

/settings
```

---

# 44. UX Requirements

## Search

Debounce:

```text
300–500ms
```

## Delete

Confirm dialog.

## Mutation

Disable button khi pending.

## Table

Preserve filters khi quay về từ detail.

## Edit

Warn nếu rời form khi có unsaved changes.

## Session

Nếu online data cần realtime:
- ưu tiên polling API hiện tại
- hoặc websocket nếu backend đã support

Không tự tạo websocket backend.

---

# 45. Security UI Notes

Frontend không phải security boundary.

Tuy nhiên:

- Không log password
- Không lưu password plain text trong localStorage
- Không show access token
- Không show secret RADIUS
- Không show API secret
- Không show raw SQL
- Sanitize user input khi render
- Respect permission response từ backend

---

# 46. Authentication

Nếu project đã có auth:

- giữ nguyên auth flow
- dùng token/interceptor hiện có
- không rewrite

Nếu API trả 401:

```text
clear invalid session
redirect login
```

Nếu 403:

```text
show permission denied
```

---

# 47. Permission-aware UI

Nếu API có role/permission:

Ví dụ:

```ts
can("users.create")
can("users.update")
can("users.delete")
can("sessions.disconnect")
```

Ẩn hoặc disable action tương ứng.

Nhưng backend vẫn phải enforce permission.

---

# 48. Confirmation dialogs

Các action cần confirm:

```text
Delete user
Disable user
Bulk delete
Disconnect session
Reset quota
Reset time
Delete package
Delete RADIUS profile
```

---

# 49. Performance

Danh sách lớn có thể > 10,000 users.

Do đó:

- Server-side pagination
- Debounced search
- Không load toàn bộ user lên browser
- Không render chart từ hàng triệu accounting records
- Backend aggregation nếu API đã có
- Memoize table columns
- Avoid unnecessary refetch

---

# 50. Accessibility

- Button có label
- Icon button có aria-label
- Modal focus trap
- Keyboard navigation
- Contrast tốt
- Không chỉ dùng màu để truyền trạng thái
- Input có label
- Error có text

---

# 51. UI text

Dùng tiếng Việt cho operator.

Ví dụ:

```text
Tổng người dùng
Đang online
Đã hết hạn
Tổng lưu lượng

Danh sách người dùng

Tạo user
Nhập
Xuất

Tất cả nhóm
Tất cả trạng thái

Thông tin người dùng

Lưu lượng & phiên đăng nhập
Thuộc tính RADIUS
Lịch sử hoạt động
```

---

# 52. Design Detail – Main User Management Screen

Màn hình chính nên gần bố cục sau:

```text
┌ Sidebar ────────┬─────────────────────────────────────────────────────────┐
│ Tổng quan       │ Topbar                                                  │
│ Người dùng      ├────────────┬────────────┬────────────┬──────────────────┤
│  Danh sách      │ Tổng user  │ Online     │ Hết hạn    │ Tổng traffic      │
│  Tạo user       ├─────────────────────────────────────────────────────────┤
│  Import         │ Danh sách người dùng                   [+ Tạo user]     │
│ Gói cước        │                                     [Import] [Export]  │
│ RADIUS          ├─────────────────────────────────────────────────────────┤
│ Sessions        │ Search | Group | Status | Date Range | Search Button    │
│ Reports         ├─────────────────────────────────────────────────────────┤
│ Settings        │ User table                                              │
│                 │                                                         │
│                 ├─────────────────────────────────────────────────────────┤
│                 │ User info       │ Traffic | Session | RADIUS | Activity │
└─────────────────┴─────────────────────────────────────────────────────────┘
```

---

# 53. User table example

Mock data chỉ sử dụng cho frontend dev:

```json
[
  {
    "id": "1",
    "username": "guest001",
    "displayName": "Nguyễn Văn A",
    "groupName": "Khách lẻ",
    "packageName": "1H_50K",
    "expiresAt": "2026-09-12T14:30:00+07:00",
    "totalBytes": 536870912,
    "status": "online"
  },
  {
    "id": "2",
    "username": "guest002",
    "displayName": "Trần Thị B",
    "groupName": "Khách lẻ",
    "packageName": "1D_100K",
    "expiresAt": "2026-09-12T23:59:00+07:00",
    "totalBytes": 1288490188,
    "status": "offline"
  }
]
```

Mock chỉ dùng khi API chưa available trong dev environment.

Không để mock data chạy production.

---

# 54. Acceptance Criteria

Frontend được xem là đạt khi:

- Sidebar hoạt động
- Responsive
- Dashboard stats hiển thị được API data
- User table hiển thị data thật
- Pagination hoạt động
- Search hoạt động
- Filter hoạt động
- Selected user hiển thị detail
- Create user hoạt động
- Edit user hoạt động
- Delete user có confirm
- Enable/disable hoạt động nếu API có
- User detail tabs hoạt động
- Session table hoạt động
- Traffic formatting đúng
- Status badge đúng
- Loading / empty / error state đầy đủ
- Import UI hoàn chỉnh
- Export UI hoàn chỉnh
- Package UI hoàn chỉnh
- RADIUS profile UI hoàn chỉnh
- Reports UI hoàn chỉnh
- No backend modification
- No API breaking changes
- TypeScript không lỗi
- Không duplicate business mapping logic
- UI không hardcode dữ liệu production

---

# 55. Priority Implementation Order

Thực hiện theo thứ tự:

```text
1. Layout shell
2. Sidebar + Topbar
3. API client/service adapter
4. Dashboard stats
5. User list
6. Filters
7. User detail
8. Create/Edit user
9. Status actions
10. Session history
11. Packages
12. RADIUS profiles
13. Import/Export
14. Reports
15. Responsive + polish
```

---

# 56. Important Instructions for Claude

## DO

- Đọc codebase hiện tại trước khi code
- Giữ convention hiện tại
- Reuse components hiện có
- Reuse API client hiện có
- Reuse auth hiện có
- Reuse environment config hiện có
- Kiểm tra OpenAPI/Swagger/API service nếu project có
- Tạo adapter để map backend data
- Tạo component nhỏ, reusable
- Giữ TypeScript strict
- Xử lý loading/error/empty
- Dùng API thật khi available
- Có fallback dev mock riêng biệt nếu thật sự cần

## DO NOT

- Không tự build backend
- Không tự build FreeRADIUS server
- Không tự build MikroTik integration server
- Không tự tạo database schema
- Không tự viết SQL migration
- Không đổi API contract server
- Không hardcode endpoint rải rác
- Không hardcode token
- Không hardcode username/password thật
- Không lưu plaintext password
- Không fake backend response trong production
- Không tạo tính năng server chưa có mà không có graceful disabled state
- Không rewrite toàn bộ project nếu chỉ cần thêm module UI này

---

# 57. Expected Deliverable

Sau khi hoàn thành, frontend nên có trải nghiệm:

```text
Admin đăng nhập
    ↓
Dashboard
    ↓
Danh sách user
    ↓
Search / Filter
    ↓
Click user
    ↓
Xem thông tin + lưu lượng + session + RADIUS
    ↓
Thực hiện quản lý user
    ├─ Edit
    ├─ Disable
    ├─ Extend
    ├─ Change package
    ├─ Reset usage
    └─ Delete
```

Frontend là **control panel**.

Backend/API là **nguồn dữ liệu và business logic**.

FreeRADIUS là **authentication/accounting engine**.

MikroTik là **NAS / hotspot gateway**.

Không trộn trách nhiệm giữa các layer.

---

# 58. Final instruction

Hãy bắt đầu bằng cách:

1. Scan cấu trúc repository.
2. Xác định framework frontend.
3. Xác định component library.
4. Xác định API client hiện có.
5. Xác định endpoint liên quan user/package/session/RADIUS.
6. Lập mapping DTO → UI model.
7. Xây layout shell.
8. Xây màn hình `/users` trước.
9. Kết nối API hiện tại.
10. Hoàn thiện các màn hình còn lại.

**Không cần hỏi thiết kế backend. Backend/API sẽ được xử lý riêng.**

Nếu API response thực tế khác với dữ liệu UI cần, hãy xử lý bằng frontend adapter.

Mục tiêu cuối cùng là một giao diện quản trị MikroTik + FreeRADIUS rõ ràng, nhanh, dễ vận hành và có thể mở rộng.
