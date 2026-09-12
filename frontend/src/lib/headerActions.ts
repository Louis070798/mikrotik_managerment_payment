import { createContext, useContext, useEffect, type DependencyList, type ReactNode } from 'react';

/**
 * Cho phep 1 trang con "day" node (thuong la nut hanh dong chinh, vd "+ Tao network moi",
 * "+ Tenant moi") len thanh header dung chung cua Layout.tsx, thay vi tu ve rieng 1 hang o dau
 * noi dung trang -- nguoi dung yeu cau dua cac nut nay len "khu vuc dieu huong" (header co
 * breadcrumb) thay vi noi dung trang. Layout cung cap setter qua Context; trang con goi
 * useHeaderActions(). Tu don node cu khi component unmount (chuyen trang) de khong con nut cu
 * dinh lai tren header cua trang khac.
 */
export const HeaderActionsContext = createContext<(node: ReactNode) => void>(() => {});

export function useHeaderActions(node: ReactNode, deps: DependencyList): void {
    const setActions = useContext(HeaderActionsContext);
    useEffect(() => {
        setActions(node);
        return () => setActions(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
