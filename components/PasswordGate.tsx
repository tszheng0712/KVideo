'use client';

import { useState, useEffect } from 'react';
import { getSession, setSession } from '@/lib/store/auth-store';
import { useSubscriptionSync } from '@/lib/hooks/useSubscriptionSync';
import { settingsStore } from '@/lib/store/settings-store';
import { Lock } from 'lucide-react';

export function PasswordGate({ children, hasAuth: initialHasAuth }: { children: React.ReactNode, hasAuth: boolean }) {
    useSubscriptionSync();

    const [isLocked, setIsLocked] = useState(true);
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);
    const [isClient, setIsClient] = useState(false);
    const [isValidating, setIsValidating] = useState(false);

    useEffect(() => {
        let mounted = true;

        const init = async () => {
            try {
                // 1. 直接向 API 請求，確認目前環境是否需要密碼
                const res = await fetch('/api/auth');
                if (!res.ok) throw new Error('Failed to fetch auth config');
                const data = await res.json();

                // 2. 檢查本地 Session
                const session = getSession();
                const isAuthenticated = !!session;

                if (mounted) {
                    // 以 API 的 hasAuth 為最高準則
                    // 只要 API 說要驗證，且使用者沒登入，就鎖定
                    const shouldLock = data.hasAuth && !isAuthenticated;
                    
                    setIsLocked(shouldLock);
                    setIsClient(true);

                    // 同步訂閱源（如果你有設定的話）
                    if (data.subscriptionSources) {
                        settingsStore.syncEnvSubscriptions(data.subscriptionSources);
                    }
                }
            } catch (e) {
                console.error("PasswordGate init failed:", e);
                // 萬一 API 壞了，退而求其次使用傳進來的 Props
                if (mounted) {
                    setIsLocked(initialHasAuth && !getSession());
                    setIsClient(true);
                }
            }
        };

        init();
        return () => { mounted = false; };
    }, [initialHasAuth]);

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsValidating(true);

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
            }
        } catch {
            // API 錯誤處理
        }

        setError(true);
        setIsValidating(false);
        const form = document.getElementById('password-form');
        form?.classList.add('animate-shake');
        setTimeout(() => form?.classList.remove('animate-shake'), 500);
    };

    // 關鍵：在確定是否解鎖前，不渲染任何內容（防止內容閃現）
    if (!isClient) {
        return <div className="fixed inset-0 bg-black z-[9999]" />; 
    }

    if (!isLocked) {
        return <>{children}</>;
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg-color)] bg-[image:var(--bg-image)] text-[var(--text-color)]">
            <div className="w-full max-w-md p-4">
                <form
                    id="password-form"
                    onSubmit={handleUnlock}
                    className="bg-[var(--glass-bg)] backdrop-blur-[25px] saturate-[180%] border border-[var(--glass-border)] rounded-[var(--radius-2xl)] p-8 shadow-[var(--shadow-md)] flex flex-col items-center gap-6 transition-all duration-[0.4s]"
                >
                    <div className="w-16 h-16 rounded-[var(--radius-full)] bg-[var(--accent-color)]/10 flex items-center justify-center text-[var(--accent-color)] mb-2 shadow-[var(--shadow-sm)] border border-[var(--glass-border)]">
                        <Lock size={32} />
                    </div>

                    <div className="text-center space-y-2">
                        <h2 className="text-2xl font-bold">訪問受限</h2>
                        <p className="text-[var(--text-color-secondary)]">請輸入訪問密碼以繼續</p>
                    </div>

                    <div className="w-full space-y-4">
                        <div className="space-y-2">
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setError(false);
                                }}
                                placeholder="輸入密碼..."
                                className={`w-full px-4 py-3 rounded-[var(--radius-2xl)] bg-[var(--glass-bg)] border ${error ? 'border-red-500' : 'border-[var(--glass-border)]'} focus:outline-none focus:border-[var(--accent-color)] text-[var(--text-color)]`}
                                autoFocus
                            />
                            {error && <p className="text-sm text-red-500 text-center animate-pulse">密碼錯誤</p>}
                        </div>

                        <button
                            type="submit"
                            disabled={isValidating}
                            className="w-full py-3 px-4 bg-[var(--accent-color)] text-white font-bold rounded-[var(--radius-2xl)] hover:translate-y-[-2px] transition-all disabled:opacity-50"
                        >
                            {isValidating ? '驗證中...' : '登錄'}
                        </button>
                    </div>
                </form>
            </div>
            <style jsx global>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .animate-shake {
                    animation: shake 0.3s cubic-bezier(.36,.07,.19,.97) both;
                }
            `}</style>
        </div>
    );
}
