/**
 * Database schema types for Supabase entities
 * Bao gồm các bảng requests, transactions, assets, profiles...
 */

export interface DatabaseRequest {
  id: string;
  type: string;
  notes?: string | null;
  scan_url?: string | null;
  created_by?: string | null;
  created_at: string;
  details?: Record<string, any> | null;
}

export interface DatabaseTransaction {
  id: string;
  type: 'checkout' | 'checkin';
  notes?: string | null;
  scan_url?: string | null;
  created_by?: string | null;
  created_at: string;
  details?: Record<string, any> | null;
  warehouse_id?: string | null;
}

export interface DatabaseTransactionItem {
  id: string;
  transaction_id: string;
  asset_id: string;
  type: 'checkout' | 'checkin';
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  voucher_code?: string | null;
  details?: Record<string, any> | null;
  notes?: string | null;
  created_at?: string;
}

export * from './index';
