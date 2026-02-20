'use client';

import { useState, useEffect } from 'react';
import { getSession, setSession } from '@/lib/store/auth-store';
import { useSubscriptionSync } from '@/lib/hooks/useSubscriptionSync';
import { settingsStore } from '@/lib/store/settings-store';
import { Lock } from 'lucide-react';
export function PasswordGate({ children, hasAuth: initialHasAuth }: { children: React.ReactNode, hasAuth: boolean }) {
    // 保持原本專案的訂閱同步邏輯
    useSubscriptionSync();

    // 狀態初始化
    const [isLocked, setIsLocked] = useState(true);
    const [isClient, setIsClient] = useState(false);
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);
    const [isValidating, setIsValidating] = useState(false);

    useEffect(() => {
        let mounted = true;

        const checkAuth = async () => {
            const session = getSession();
            const isAuthenticated = !!session;

            try {
                // 1. 請求後端 API
                const res = await fetch('/api/auth');
                if (!res.ok) throw new Error('Auth API failed');
                const data = await res.json();

                if (mounted) {
                    // 同步訂閱源（如果有）
                    if (data.subscriptionSources) {
                        settingsStore.syncEnvSubscriptions(data.subscriptionSources);
                    }

                    // 強制判定：除非 API 回傳 hasAuth 為 false，否則一律鎖定直到登入
                    const shouldLock = data.hasAuth && !isAuthenticated;
                    setIsLocked(shouldLock);
                }
            } catch (e) {
                console.error("Auth check error:", e);
                // 發生錯誤時（如 API 沒反應），如果沒登入就保持鎖定以保安全
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

    // 避免 Hydration 閃現：未確定客戶端身份前，顯示與背景同色的全螢幕遮罩
    if (!isClient) {
        return <div className="fixed inset-0 bg-black z-[9999]" />;
    }

    // 若不需要鎖定，直接顯示內容
    if (!isLocked) {
        return <>{children}</>;
    }

    // 密碼輸入界面（使用標準 Tailwind 類名，不引用額外 SVG）
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900 text-white font-sans">
            <div className="w-full max-w-md p-6">
                <form
                    onSubmit={handleUnlock}
                    className="bg-gray-800 border border-gray-700 rounded-3xl p-10 shadow-2xl flex flex-col items-center gap-6"
                >
                    <div className="text-center space-y-3">
                        <div className="text-4xl mb-2">🔒</div>
                        <h2 className="text-2xl font-bold tracking-tight">訪問受限</h2>
                        <p className="text-gray-400 text-sm">請輸入訪問密碼以繼續觀看</p>
                    </div>

                    <div className="w-full space-y-4">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="請輸入密碼"
                            className={`w-full px-5 py-3 rounded-2xl bg-gray-700 border ${
                                error ? 'border-red-500' : 'border-gray-600'
                            } focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-center text-lg`}
                            autoFocus
                        />
                        {error && (
                            <p className="text-xs text-red-500 text-center font-medium">
                                密碼錯誤，請重新輸入
                            </p>
                        )}
                        <button
                            type="submit"
                            disabled={isValidating}
                            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold rounded-2xl transition-all disabled:opacity-50"
                        >
                            {isValidating ? '驗證中...' : '確認登錄'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
