'use client';

import { useState, useEffect } from 'react';
import { getSession, setSession } from '@/lib/store/auth-store';
import { useSubscriptionSync } from '@/lib/hooks/useSubscriptionSync';
import { settingsStore } from '@/lib/store/settings-store';

export function PasswordGate({ children, hasAuth: initialHasAuth }: { children: React.ReactNode, hasAuth: boolean }) {
    // 啟用背景同步
    useSubscriptionSync();

    const [isLocked, setIsLocked] = useState(true);
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);
    const [isClient, setIsClient] = useState(false);
    const [isValidating, setIsValidating] = useState(false);

    useEffect(() => {
        let mounted = true;

        const init = async () => {
            const session = getSession();
            const isAuthenticated = !!session;

            try {
                // 向後端確認驗證狀態
                const res = await fetch('/api/auth');
                if (!res.ok) throw new Error('API response not ok');
                const data = await res.json();

                if (mounted) {
                    if (data.subscriptionSources) {
                        settingsStore.syncEnvSubscriptions(data.subscriptionSources);
                    }
                    // 強制邏輯：除非 API 明確說 hasAuth 為 false，否則一律鎖定
                    const shouldLock = data.hasAuth && !isAuthenticated;
                    setIsLocked(shouldLock);
                }
            } catch (e) {
                console.error("Auth init error:", e);
                // 發生錯誤時，如果沒登入就保持鎖定
                if (mounted) setIsLocked(!isAuthenticated);
            } finally {
                if (mounted) setIsClient(true);
            }
        };

        init();
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

    // 在客戶端狀態確定前，渲染全螢幕背景，避免內容洩漏
    if (!isClient) {
        return <div className="fixed inset-0 bg-black z-[9999]" />;
    }

    if (!isLocked) {
        return <>{children}</>;
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900 text-white">
            <div className="w-full max-w-md p-6">
                <form
                    onSubmit={handleUnlock}
                    className="bg-gray-800 border border-gray-700 rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-6"
                >
                    <div className="text-center space-y-2">
                        <h2 className="text-2xl font-bold">訪問受限</h2>
                        <p className="text-gray-400">請輸入密碼以繼續</p>
                    </div>

                    <div className="w-full space-y-4">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="輸入密碼..."
                            className={`w-full px-4 py-3 rounded-xl bg-gray-700 border ${
                                error ? 'border-red-500' : 'border-gray-600'
                            } focus:outline-none focus:border-blue-500 transition-all`}
                            autoFocus
                        />
                        {error && (
                            <p className="text-sm text-red-500 text-center">
                                密碼錯誤，請重試
                            </p>
                        )}
                        <button
                            type="submit"
                            disabled={isValidating}
                            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                        >
                            {isValidating ? '驗證中...' : '登錄'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
