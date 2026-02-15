import type {
    VideoSource,
    VideoItem,
    ApiSearchResponse,
} from '@/lib/types';
import { fetchWithTimeout, withRetry } from './http-utils';

/**
 * 透過線上 API 將繁體中文轉換為簡體中文
 * 加入嚴格的逾時控管與異常處理，確保不影響主搜尋流程
 */
async function convertToSimplified(text: string): Promise<string> {
    if (!text || !text.trim()) return '';
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 限制 1 秒內必須回傳

    try {
        const response = await fetch(
            `https://api.zhconvert.org/convert?converter=Simplified&text=${encodeURIComponent(text.trim())}`,
            { 
                method: 'GET',
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            }
        );
        
        clearTimeout(timeoutId);

        if (response.ok) {
            const result = await response.json();
            if (result && result.data && typeof result.data.text === 'string') {
                // 移除可能的不可見字元並去除首尾空格
                return result.data.text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
            }
        }
    } catch (error) {
        // 逾時或連線失敗時，在控制台警告但不拋出錯誤
        console.warn('簡繁轉換跳過或失敗:', error instanceof Error ? error.message : error);
    } finally {
        clearTimeout(timeoutId);
    }
    
    return text; // 任何情況失敗都回傳原始文字
}

/**
 * 從單一資源站搜尋影片
 */
async function searchVideosBySource(
    query: string,
    source: VideoSource,
    page: number = 1
): Promise<{ results: VideoItem[]; source: string; responseTime: number }> {
    const startTime = Date.now();

    const url = new URL(`${source.baseUrl}${source.searchPath}`);
    url.searchParams.set('ac', 'detail');
    url.searchParams.set('wd', query); 
    url.searchParams.set('pg', String(page));

    try {
        const response = await withRetry(async () => {
            const res = await fetchWithTimeout(url.toString(), {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    ...source.headers,
                },
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        });

        const data: ApiSearchResponse = await response.json();

        const results: VideoItem[] = (Array.isArray(data.list) ? data.list : []).map(item => ({
            ...item,
            source: source.id,
        }));

        return {
            results,
            source: source.id,
            responseTime: Date.now() - startTime,
        };
    } catch (error) {
        return {
            results: [],
            source: source.id,
            responseTime: 0,
        };
    }
}

/**
 * 並行搜尋入口
 */
export async function searchVideos(
    query: string,
    sources: VideoSource[],
    page: number = 1
): Promise<Array<{ results: VideoItem[]; source: string; responseTime?: number; error?: string }>> {
    
    // 1. 執行簡繁轉換（帶逾時保護）
    const simplifiedQuery = await convertToSimplified(query);

    // 2. 執行所有影視站的並行搜尋
    const searchPromises = sources.map(async source => {
        try {
            return await searchVideosBySource(simplifiedQuery, source, page);
        } catch (error) {
            return {
                results: [],
                source: source.id,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });

    return Promise.all(searchPromises);
}
