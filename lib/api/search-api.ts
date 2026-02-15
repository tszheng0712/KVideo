import type {
    VideoSource,
    VideoItem,
    ApiSearchResponse,
} from '@/lib/types';
import { fetchWithTimeout, withRetry } from './http-utils';

/**
 * 透過線上 API 將繁體中文轉換為簡體中文
 * 解決在某些影視站搜尋繁體找不到結果的問題（如：葬送的芙莉蓮）
 */
async function convertToSimplified(text: string): Promise<string> {
    if (!text) return '';
    
    try {
        // 使用 zhconvert 免費接口進行轉換
        const response = await fetch(
            `https://api.zhconvert.org/convert?converter=Simplified&text=${encodeURIComponent(text)}`,
            { method: 'GET' }
        );
        
        if (!response.ok) throw new Error('Conversion API failed');
        
        const data = await response.json();
        return data.data.text || text;
    } catch (error) {
        console.error('簡繁轉換失敗，回退至原始文字:', error);
        return text; // 發生錯誤時回傳原文字，確保搜尋功能不中斷
    }
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
    url.searchParams.set('wd', query); // 此處接收已轉換好的簡體字串
    url.searchParams.set('pg', page.toString());

    try {
        const response = await withRetry(async () => {
            const res = await fetchWithTimeout(url.toString(), {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    ...source.headers,
                },
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }

            return res;
        });

        const data: ApiSearchResponse = await response.json();

        if (data.code !== 1 && data.code !== 0) {
            throw new Error(data.msg || 'Invalid API response');
        }

        const results: VideoItem[] = (data.list || []).map(item => ({
            ...item,
            source: source.id,
        }));

        return {
            results,
            source: source.id,
            responseTime: Date.now() - startTime,
        };
    } catch (error) {
        console.error(`資源站 ${source.name} 搜尋失敗:`, error);
        throw {
            code: 'SEARCH_FAILED',
            message: `無法從 ${source.name} 獲取搜尋結果`,
            source: source.id,
            retryable: true,
        };
    }
}


/**
 * 並行從多個資源站搜尋影片
 */
export async function searchVideos(
    query: string,
    sources: VideoSource[],
    page: number = 1
): Promise<Array<{ results: VideoItem[]; source: string; responseTime?: number; error?: string }>> {
    
    // 在並行搜尋開始前，先將關鍵字轉為簡體（只轉換一次以節省資源）
    const simplifiedQuery = await convertToSimplified(query);

    const searchPromises = sources.map(async source => {
        try {
            // 傳入轉換後的簡體關鍵字
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
