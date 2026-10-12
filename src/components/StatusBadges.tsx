import React from 'react';
import { CustodyStatus, LifecycleStatus, MortgageStatus, SaleStatus } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Props {
  custody_status: CustodyStatus;
  lifecycle_status: LifecycleStatus;
  sale_status: SaleStatus;
  mortgage_status?: MortgageStatus;
  className?: string;
  showMortgage?: boolean;
}

export const StatusBadges: React.FC<Props> = ({ 
  custody_status, 
  lifecycle_status, 
  sale_status, 
  mortgage_status = 'none',
  className,
  showMortgage = true
}) => {
  type Tone = 'ok' | 'info' | 'warn' | 'danger' | 'neutral';
  const TONE: Record<Tone, string> = {
    ok: 'bg-ok-bg text-ok-fg',
    info: 'bg-info-bg text-info-fg',
    warn: 'bg-warn-bg text-warn-fg',
    danger: 'bg-danger-bg text-danger-fg',
    neutral: 'bg-neutral-bg text-neutral-fg',
  };

  const getCustodyProps = (status: CustodyStatus): { label: string; tone: Tone } => {
    switch (status) {
      case 'in_stock': return { label: 'Trong kho', tone: 'ok' };
      case 'checked_out': return { label: 'Đang mượn/xuất', tone: 'warn' };
      case 'in_transit': return { label: 'Đang luân chuyển', tone: 'info' };
      default: return { label: status, tone: 'neutral' };
    }
  };

  const getLifecycleProps = (status: LifecycleStatus): { label: string; tone: Tone } => {
    switch (status) {
      case 'active': return { label: 'Active', tone: 'info' };
      case 'split': return { label: 'Đã tách', tone: 'neutral' };
      case 'invalidated': return { label: 'Vô hiệu', tone: 'danger' };
      default: return { label: status, tone: 'neutral' };
    }
  };

  const getSaleProps = (status: SaleStatus): { label: string; tone: Tone } => {
    switch (status) {
      case 'not_ready': return { label: 'Chưa SS bán', tone: 'neutral' };
      case 'ready_for_sale': return { label: 'Sẵn sàng bán', tone: 'ok' };
      case 'sold': return { label: 'Đã bán', tone: 'info' };
      default: return { label: status, tone: 'neutral' };
    }
  };

  const getMortgageProps = (status: MortgageStatus): { label: string; tone: Tone } => {
    switch (status) {
      case 'none': return { label: 'Không thế chấp', tone: 'neutral' };
      case 'mortgaged': return { label: 'Đang thế chấp', tone: 'warn' };
      default: return { label: status, tone: 'neutral' };
    }
  };

  // Nhãn trạng thái: có chấm tròn cùng màu chữ để không chỉ dựa vào màu
  const renderBadge = (props: { label: string; tone: Tone }, title: string) => (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap',
        TONE[props.tone]
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
      {props.label}
    </span>
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {renderBadge(getCustodyProps(custody_status), "Lưu kho")}
      {renderBadge(getLifecycleProps(lifecycle_status), "Vòng đời")}
      {renderBadge(getSaleProps(sale_status), "Kinh doanh")}
      {showMortgage && renderBadge(getMortgageProps(mortgage_status), "Thế chấp")}
    </div>
  );
};