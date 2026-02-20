import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// 將取得密碼的邏輯封裝成函數，確保動態讀取
function getEffectiveAdminPassword() {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '';
  const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || process.env.NEXT_PUBLIC_ACCESS_PASSWORD || '';
  const DEFAULT_PASSWORD = 'password'; 

  // 只要有任何一個有值，就回傳；都沒有就用預設
  return ADMIN_PASSWORD || ACCESS_PASSWORD || DEFAULT_PASSWORD;
}

function getSubscriptionSources() {
  return process.env.SUBSCRIPTION_SOURCES || process.env.NEXT_PUBLIC_SUBSCRIPTION_SOURCES || '';
}

function getPersistSession() {
  return process.env.PERSIST_SESSION !== 'false';
}

interface AccountEntry {
  password: string;
  name: string;
  role: 'super_admin' | 'admin' | 'viewer';
  customPermissions: string[];
}

function parseAccounts(): AccountEntry[] {
  const ACCOUNTS = process.env.ACCOUNTS || '';
  if (!ACCOUNTS) return [];

  return ACCOUNTS.split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
    .map(entry => {
      const parts = entry.split(':');
      if (parts.length < 2) return null;
      const [password, name, role, perms] = parts;
      const parsedRole = role?.trim();
      const customPermissions = perms
        ? perms.split('|').map(p => p.trim()).filter(p => p.length > 0)
        : [];
      return {
        password: password.trim(),
        name: name.trim(),
        role: (parsedRole === 'super_admin' ? 'super_admin' : parsedRole === 'admin' ? 'admin' : 'viewer') as 'super_admin' | 'admin' | 'viewer',
        customPermissions,
      };
    })
    .filter((a): a is AccountEntry => a !== null && a.password.length > 0 && a.name.length > 0);
}

async function generateProfileId(password: string): Promise<string> {
  const salt = 'kvideo-profile-salt-v1';
  const data = new TextEncoder().encode(password + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- API Handlers ---

export async function GET() {
  const adminPwd = getEffectiveAdminPassword();
  const accounts = parseAccounts();
  
  // 關鍵修復：確保 hasAuth 絕對反應密碼是否存在
  const hasAuth = !!(adminPwd || accounts.length > 0);

  return NextResponse.json({
    hasAuth,
    persistSession: getPersistSession(),
    subscriptionSources: getSubscriptionSources(),
    // 增加一個 debug 標記（測試完可以刪除）
    _debug: {
      usingDefault: adminPwd === 'password' && !process.env.ADMIN_PASSWORD
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const adminPwd = getEffectiveAdminPassword();
    const persist = getPersistSession();

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ valid: false, message: 'Password required' }, { status: 400 });
    }

    // 1. 檢查管理員密碼
    if (adminPwd && password === adminPwd) {
      const profileId = await generateProfileId(password);
      return NextResponse.json({
        valid: true,
        name: '管理员',
        role: 'super_admin',
        profileId,
        persistSession: persist,
      });
    }

    // 2. 檢查多帳號
    const accounts = parseAccounts();
    for (const account of accounts) {
      if (password === account.password) {
        const profileId = await generateProfileId(password);
        return NextResponse.json({
          valid: true,
          name: account.name,
          role: account.role,
          profileId,
          persistSession: persist,
          customPermissions: account.customPermissions.length > 0 ? account.customPermissions : undefined,
        });
      }
    }

    return NextResponse.json({ valid: false });
  } catch {
    return NextResponse.json({ valid: false, message: 'Invalid request' }, { status: 400 });
  }
}
