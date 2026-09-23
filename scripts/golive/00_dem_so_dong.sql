-- ============================================================================
-- 00_dem_so_dong.sql — ĐẾM SỐ DÒNG CỦA MỌI BẢNG TRONG public (CHỈ ĐỌC, an toàn, chạy lúc nào cũng được)
-- ============================================================================
-- Dùng: (1) trước khi dọn dữ liệu, để biết có gì trong DB và phát hiện bảng không nằm trong danh sách dọn;
--       (2) sau khi dọn, để kiểm tra các bảng nghiệp vụ đã về 0 và các bảng danh mục còn nguyên.
-- Kết quả xếp theo số dòng giảm dần.

SELECT table_name AS bang,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::int AS so_dong
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY so_dong DESC, bang;