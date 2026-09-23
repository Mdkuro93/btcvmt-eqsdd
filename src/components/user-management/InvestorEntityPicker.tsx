import React, { useMemo, useState } from 'react';
import { Building, Search, X } from 'lucide-react';
import { InvestorEntity } from '../../types';

/** Bỏ dấu tiếng Việt + về chữ thường để tìm kiếm "dcc", "hoa quy"... vẫn ra kết quả */
const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

const entityLabel = (e: InvestorEntity): string =>
  e.company_code ? `${e.name} (${e.company_code})` : e.name;

const matchesEntity = (e: InvestorEntity, q: string): boolean =>
  normalize(`${e.name} ${e.company_code ?? ''}`).includes(q);

/* ------------------------------------------------------------------ */
/* 1. Ô chọn nhiều pháp nhân đại diện (có tìm kiếm + chọn nhanh)       */
/* ------------------------------------------------------------------ */

interface InvestorEntityPickerProps {
  entities: InvestorEntity[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export const InvestorEntityPicker: React.FC<InvestorEntityPickerProps> = ({
  entities,
  selectedIds,
  onChange,
}) => {
  const [query, setQuery] = useState('');

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return entities;
    return entities.filter(e => matchesEntity(e, q));
  }, [entities, query]);

  const selectedEntities = useMemo(
    () => entities.filter(e => selectedSet.has(e.id)),
    [entities, selectedSet]
  );

  const isFiltering = query.trim().length > 0;
  const filteredIds = filtered.map(e => e.id);
  const allFilteredSelected = filtered.length > 0 && filtered.every(e => selectedSet.has(e.id));

  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      if (!selectedSet.has(id)) onChange([...selectedIds, id]);
    } else {
      onChange(selectedIds.filter(x => x !== id));
    }
  };

  const selectFiltered = () => {
    onChange(Array.from(new Set([...selectedIds, ...filteredIds])));
  };

  const unselectFiltered = () => {
    const drop = new Set(filteredIds);
    onChange(selectedIds.filter(id => !drop.has(id)));
  };

  return (
    <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-xl space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="block text-xs font-semibold text-rose-950 flex items-center gap-1.5">
          <Building className="w-3.5 h-3.5 text-rose-700" />
          Pháp nhân đại diện:{' '}
          <span className="font-normal text-rose-700">({selectedIds.length} pháp nhân đã chọn)</span>
        </label>
        <div className="flex items-center gap-2 text-xs">
          {allFilteredSelected ? (
            <button
              type="button"
              onClick={unselectFiltered}
              className="text-rose-700 hover:text-rose-900 font-medium hover:underline cursor-pointer"
            >
              {isFiltering ? `Bỏ chọn ${filtered.length} kết quả` : 'Bỏ chọn tất cả'}
            </button>
          ) : (
            <button
              type="button"
              onClick={selectFiltered}
              disabled={filtered.length === 0}
              className="text-rose-700 hover:text-rose-900 font-medium hover:underline cursor-pointer disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
            >
              {isFiltering ? `Chọn ${filtered.length} kết quả đang lọc` : 'Chọn tất cả'}
            </button>
          )}
          {selectedIds.length > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-gray-500 hover:text-gray-700 hover:underline cursor-pointer"
              >
                Xóa hết đã chọn
              </button>
            </>
          )}
        </div>
      </div>

      <div className="text-[11px] text-rose-800">
        Chỉ định các pháp nhân CĐT/NĐT mà tài khoản đại diện để có quyền xem và gửi yêu cầu mượn/trả GCN sở hữu.
      </div>

      {entities.length === 0 ? (
        <div className="p-3 bg-white rounded-lg border border-rose-200 text-xs text-rose-600 text-center">
          Chưa có dữ liệu danh mục pháp nhân CĐT/NĐT. Vui lòng vào mục Quản trị &gt; Pháp nhân CĐT/NĐT để thêm mới.
        </div>
      ) : (
        <>
          {/* Ô tìm kiếm */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc mã pháp nhân (VD: DCC, S019)..."
              className="w-full pl-8 pr-8 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                title="Xóa từ khóa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Các pháp nhân đã chọn (thẻ, bấm × để bỏ) */}
          {selectedEntities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {selectedEntities.map(ent => (
                <span
                  key={ent.id}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-[11px] font-medium bg-rose-600 text-white rounded-full"
                >
                  {entityLabel(ent)}
                  <button
                    type="button"
                    onClick={() => toggle(ent.id, false)}
                    className="p-0.5 rounded-full hover:bg-rose-800 cursor-pointer"
                    title="Bỏ chọn"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="text-[11px] text-gray-500">
            Hiển thị {filtered.length}/{entities.length} pháp nhân
          </div>

          {/* Danh sách */}
          {filtered.length === 0 ? (
            <div className="p-3 bg-white rounded-lg border border-rose-200 text-xs text-gray-500 text-center">
              Không tìm thấy pháp nhân nào khớp với "{query}".
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto pr-1">
              {filtered.map(ent => {
                const isChecked = selectedSet.has(ent.id);
                return (
                  <label
                    key={ent.id}
                    className={`flex items-center gap-2 text-xs p-2.5 rounded-lg border cursor-pointer transition ${
                      isChecked
                        ? 'bg-rose-100/70 border-rose-300 text-rose-950 font-medium'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={e => toggle(ent.id, e.target.checked)}
                      className="rounded text-rose-600"
                    />
                    <span className="flex-1 truncate">{entityLabel(ent)}</span>
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 2. Ô "Cơ quan / Đơn vị công tác" gợi ý từ danh mục pháp nhân        */
/* ------------------------------------------------------------------ */

interface OrganizationEntityInputProps {
  value: string;
  onChange: (value: string) => void;
  entities: InvestorEntity[];
  selectedIds: string[];
  /** Gọi khi người dùng bấm chọn một gợi ý: cha sẽ điền tên đơn vị và tick pháp nhân đó */
  onPickEntity: (entity: InvestorEntity) => void;
  placeholder?: string;
}

export const OrganizationEntityInput: React.FC<OrganizationEntityInputProps> = ({
  value,
  onChange,
  entities,
  selectedIds,
  onPickEntity,
  placeholder,
}) => {
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = normalize(value.trim());
    if (!q) return [];
    return entities.filter(e => matchesEntity(e, q)).slice(0, 6);
  }, [entities, value]);

  return (
    <div className="relative">
      <input
        type="text"
        placeholder={placeholder || 'Gõ tên hoặc mã pháp nhân để chọn nhanh...'}
        value={value}
        onChange={e => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1E3A8A]"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map(ent => (
            <li key={ent.id}>
              <button
                type="button"
                // onMouseDown (không dùng onClick) để chọn được trước khi ô nhập mất focus
                onMouseDown={ev => {
                  ev.preventDefault();
                  onPickEntity(ent);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-rose-50 flex items-center justify-between gap-2 cursor-pointer"
              >
                <span className="truncate">{entityLabel(ent)}</span>
                {selectedIds.includes(ent.id) && (
                  <span className="text-[10px] font-semibold text-rose-600 shrink-0">Đã chọn</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};