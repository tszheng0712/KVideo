'use client';

import { useState, useEffect } from 'react';

// 假設你的 lib 目錄下有這些檔案，如果編譯還是報錯，請確認路徑是否正確
// 如果連這些路徑都報錯，請告訴我，我們連這個都寫死
import { getSession, setSession } from '@/lib/store/auth-store';

export function PasswordGate({ children, hasAuth: initialHasAuth }: { children: React.ReactNode, hasAuth: boolean }) {
    const [isLocked, setIsLocked] = useState(true);
    const [isClient, setIsClient] = useState(false);
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);
    const [isValidating, setIsValidating] = useState(false);

    useEffect(() => {
        let mounted = true;

        const checkAuth = async () => {
            // 嘗試取得本地 session
            let isAuthenticated = false;
            try {
                const session = getSession();
                isAuthenticated = !!session;
            } catch (e) {
                console.error("Session check failed");
            }

            try {
                // 請求後端 API 取得驗證狀態
                const res = await fetch('/api/auth');
                const data = await res.json();

                if (mounted) {
                    // 如果 API 說要驗證且沒登入，就鎖定
                    // 否則，只要 API 說不需要，就解除鎖定
                    const shouldLock = data.hasAuth && !isAuthenticated;
                    setIsLocked(shouldLock);
                }
            } catch (e) {
                // API 失敗時，若未登入則預設鎖定
                if (mounted) setIsLocked(!isAuthenticated);
            } finally {
                if (mounted) setIsClient(true);
            }
        };

        checkAuth();
        return () => { mounted = false; };
    }, []);

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isValidating) return;
        setIsValidating(true);
        setError(false);

        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            const data = await res.json();

            if (data.valid) {
                setSession({
                    profileId: data.profileId,
                    name: data.name,
                    role: data.role,
                    customPermissions: data.customPermissions,
                }, data.persistSession ?? true);

                window.location.reload();
                return;
            } else {
                setError(true);
            }
        } catch (err) {
            setError(true);
        } finally {
            setIsValidating(false);
        }
    };

    // 1. 防止 Hydration 錯誤與內容閃現
    if (!isClient) {
        return <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', zIndex: 9999 }} />;
    }

    // 2. 解鎖狀態直接回傳子組件
    if (!isLocked) {
        return <>{children}</>;
    }

    // 3. 密碼 UI (使用原生 CSS 樣式確保不依賴 Tailwind 以外的東西)
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#111827',
            color: '#fff',
            fontFamily: 'sans-serif'
        }}>
            <div style={{ width: '100%', maxWidth: '400px', padding: '24px' }}>
                <form 
                    onSubmit={handleUnlock}
                    style={{
                        backgroundColor: '#1f2937',
                        padding: '40px',
                        borderRadius: '24px',
                        border: '1px solid #374151',
                        textAlign: 'center'
                    }}
                >
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
                    <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>訪問受限</h2>
                    <p style={{ color: '#9ca3af', marginBottom: '24px', fontSize: '14px' }}>請輸入訪問密碼以繼續</p>
                    
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="請輸入密碼"
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '12px',
                            backgroundColor: '#374151',
                            border: error ? '1px solid #ef4444' : '1px solid #4b5563',
                            color: '#fff',
                            marginBottom: '16px',
                            textAlign: 'center',
                            outline: 'none'
                        }}
                        autoFocus
                    />
                    
                    {error && <p style={{ color: '#ef4444', fontSize: '12px', marginBottom: '16px' }}>密碼錯誤，請重試</p>}
                    
                    <button
                        type="submit"
                        disabled={isValidating}
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '12px',
                            backgroundColor: '#2563eb',
                            color: '#fff',
                            fontWeight: 'bold',
                            border: 'none',
                            cursor: isValidating ? 'not-allowed' : 'pointer',
                            opacity: isValidating ? 0.7 : 1
                        }}
                    >
                        {isValidating ? '驗證中...' : '確認登錄'}
                    </button>
                </form>
            </div>
        </div>
    );
}
