// Thời gian SLA (Service Level Agreement) mặc định để kho xử lý các yêu cầu (checkout, mortgage, sale_update...)
// Ý nghĩa: Sau khi tạo yêu cầu, bộ phận kho có thời gian tối đa này để xử lý và bàn giao GCN cho người mượn.
export const DEFAULT_WAREHOUSE_SLA_DAYS = 3;

// Thời hạn mặc định cho việc mượn sổ (chỉ áp dụng cho yêu cầu checkout)
// Ý nghĩa: Khi mượn sổ, người dùng có thời gian tối đa này để hoàn trả lại GCN cho kho.
export const DEFAULT_RETURN_DAYS = 15;
