/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ZeroTierMember = {
    /**
     * ZeroTier node ID (10 ky tu hex).
     */
    id?: string;
    address?: string;
    /**
     * Ten hien thi luu rieng o he thong nay (zerotierMemberLabels) -- controller ZeroTier chuan khong co field nay that su.
     */
    name?: string | null;
    authorized?: boolean | null;
    /**
     * Suy ra tu GET /peer that -- CHI la goc nhin cua CHINH controller (no co dang lien lac truc tiep voi thiet bi hay khong), KHONG phai goc nhin toan mang (sau khi 2 thiet bi da ket noi P2P, traffic that di thang khong qua controller nua). Vi vay chi true la khang dinh chac (dang co path active that). false=tung ket noi (co version that) nhung controller hien khong co tin hieu truc tiep -- KHONG dong nghia thiet bi dang tat. null=chua tung thay ket noi nao.
     */
    online?: boolean | null;
    ip_assignments?: Array<string>;
    /**
     * IP:port that node nay dang ket noi toi tu do -- null neu chua tung ket noi/controller chua thay.
     */
    physical_address?: string | null;
    version?: string | null;
    last_authorized_at?: string | null;
    last_deauthorized_at?: string | null;
};

