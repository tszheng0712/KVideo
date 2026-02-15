import type {
    VideoSource,
    VideoItem,
    ApiSearchResponse,
} from '@/lib/types';
import { fetchWithTimeout, withRetry } from './http-utils';

/**
 * 透過線上 API 將繁體中文轉換為簡體中文
 */
async function convertToSimplified(text: string): Promise<string> {
    if (!text || !text.trim()) return '';
    
    try {
        const response = await fetch(
            `https://api.zhconvert.org/convert?converter=Simplified&text=${encodeURIComponent(text.trim())}`,
            { 
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            }
        );
        
        if (!response.ok) throw new Error(`API 狀態碼: ${response.status}`);
        
        const result = await response.json();
        
        // 根據測試結果：提取 result.data.text
        if (result && result.data && typeof result.data.text === 'string') {
            const converted = result.data.text.trim();
            return converted || text; // 確保不是空字串
        }
        
        return text;
    } catch (error) {
        console.error('簡繁轉換失敗:', error);
        return text; 
    }
}

/**
 * 搜尋單一資源站
 */
async function searchVideosBySource(
    query: string,
    source: VideoSource,
    page: number = 1
): Promise<{ results: VideoItem[]; source: string; responseTime: number }> {
    const startTime = Date.now();

    // 確保 query 是字串且不為空
    const searchQuery = String(query || '').trim();
    if (!searchQuery) return { results: [], source: source.id, responseTime: 0 };

    const url = new URL(`${source.baseUrl}${source.searchPath}`);
    url.searchParams.set('ac', 'detail');
    url.searchParams.set('wd', searchQuery); 
    url.searchParams.set('pg', String(page));

    try {
        const response = await withRetry(async () => {
            const res = await fetchWithTimeout(url.toString(), {
                method: 'GET',
                headers: {
                    // 模擬更真實的瀏覽器頭部，防止影視站阻擋 Cloudflare 請求
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': source.baseUrl,
                    ...source.headers,
                },
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        });

        const data: ApiSearchResponse = await response.json();

        // 確保 list 存在且為陣列
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
        console.error(`資源站 ${source.name} (${source.id}) 搜尋失敗:`, error);
        return { results: [], source: source.id, responseTime: 0 };
    }
}

/**
 * 並行搜尋主函式
 */
export async function searchVideos(
    query: string,
    sources: VideoSource[],
    page: number = 1
): Promise<Array<{ results: VideoItem[]; source: string; responseTime?: number; error?: string }>> {
    
    // 1. 等待簡繁轉換完成
    const simplifiedQuery = await convertToSimplified(query);

    // 2. 執行並行請求
    const searchPromises = sources.map(async source => {
        try {
            return await searchVideosBySource(simplifiedQuery, source, page);
        } catch (error) {
            return {
                results: [],
                source: source.id,
                error: error instanceof Error ? error.message : 'Unknown'
            };
        }
    });

    return Promise.all(searchPromises);
}
