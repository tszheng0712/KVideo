import type {
    VideoSource,
    VideoItem,
    ApiSearchResponse,
} from '@/lib/types';
import { fetchWithTimeout, withRetry } from './http-utils';

/**
 * 透過線上 API 將繁體中文轉換為簡體中文
 * 修正點：根據 API 實際回傳結構，正確提取 data.text
 */
async function convertToSimplified(text: string): Promise<string> {
    if (!text) return '';
    
    try {
        const response = await fetch(
            `https://api.zhconvert.org/convert?converter=Simplified&text=${encodeURIComponent(text)}`,
            { method: 'GET' }
        );
        
        if (!response.ok) throw new Error('Conversion API failed');
        
        const result = await response.json();
        
        // 根據你提供的 JSON 格式：result.data.text 才是正確的路徑
        if (result.code === 0 && result.data && result.data.text) {
            return result.data.text;
        }
        
        return text;
    } catch (error) {
        console.error('簡繁轉換失敗，回退至原始文字:', error);
        return text; 
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
    url.searchParams.set('wd', query); 
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
    
    // 轉換關鍵字
    const simplifiedQuery = await convertToSimplified(query);

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
