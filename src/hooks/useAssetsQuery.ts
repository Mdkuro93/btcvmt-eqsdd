import { useEffect } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { fetchAssets } from '../api/assets';
import { Asset } from '../types';

export interface AssetsQueryResult {
  data: Asset[];
  totalCount: number;
  source?: 'supabase' | 'mock';
  error?: any;
}

/**
 * Hook for high-performance cached asset loading with TanStack Query:
 * - 5 minutes stale time (instant 0ms switching between visited pages)
 * - 15 minutes garbage collection time
 * - keepPreviousData to eliminate flicker during pagination/filtering
 * - Background prefetching of next page (N+1) and previous page (N-1)
 */
export function useAssetsQuery(filters: any, page: number, pageSize: number) {
  const queryClient = useQueryClient();

  const query = useQuery<AssetsQueryResult, Error>({
    queryKey: ['assets', filters, page, pageSize],
    queryFn: () => fetchAssets(filters, page, pageSize),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000,    // 15 minutes
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  // Prefetch Page N + 1 in background
  useEffect(() => {
    if (query.data?.totalCount && page * pageSize < query.data.totalCount) {
      const nextPage = page + 1;
      queryClient.prefetchQuery({
        queryKey: ['assets', filters, nextPage, pageSize],
        queryFn: () => fetchAssets(filters, nextPage, pageSize),
        staleTime: 5 * 60 * 1000,
      });
    }
  }, [query.data, page, pageSize, filters, queryClient]);

  // Prefetch Page N - 1 in background if page > 1
  useEffect(() => {
    if (page > 1) {
      const prevPage = page - 1;
      queryClient.prefetchQuery({
        queryKey: ['assets', filters, prevPage, pageSize],
        queryFn: () => fetchAssets(filters, prevPage, pageSize),
        staleTime: 5 * 60 * 1000,
      });
    }
  }, [page, pageSize, filters, queryClient]);

  return {
    ...query,
    assets: query.data?.data || [],
    totalCount: query.data?.totalCount || 0,
    source: query.data?.source,
    isPlaceholderData: query.isPlaceholderData,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  };
}
