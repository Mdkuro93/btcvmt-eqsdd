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
  mortgage_status: MortgageStatus;
  className?: string;
}

export const StatusBadges: React.FC<Props> = ({ 
  custody_status, 
  lifecycle_status, 
  sale_status, 
  mortgage_status,
  className 
}) => {
  const getCustodyProps = (status: CustodyStatus) => {
    switch (status) {
      case 'in_stock': return { label: 'Trong kho', color: 'bg-green-100 text-green-800 border-green-200' };
      case 'checked_out': return { label: 'Đang mượn/xuất', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'in_transit': return { label: 'Đang luân chuyển', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      default: return { label: status, color: 'bg-gray-100 text-gray-800 border-gray-200' };
    }
  };

  const getLifecycleProps = (status: LifecycleStatus) => {
    switch (status) {
      case 'active': return { label: 'Active', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'split': return { label: 'Đã tách', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'invalidated': return { label: 'Vô hiệu', color: 'bg-red-100 text-red-800 border-red-200' };
      default: return { label: status, color: 'bg-gray-100 text-gray-800 border-gray-200' };
    }
  };

  const getSaleProps = (status: SaleStatus) => {
    switch (status) {
      case 'not_ready': return { label: 'Chưa SS bán', color: 'bg-gray-100 text-gray-600 border-gray-200' };
      case 'ready_for_sale': return { label: 'Sẵn sàng bán', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'sold': return { label: 'Đã bán', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      default: return { label: status, color: 'bg-gray-100 text-gray-800 border-gray-200' };
    }
  };

  const getMortgageProps = (status: MortgageStatus) => {
    switch (status) {
      case 'none': return { label: 'Không thế chấp', color: 'bg-gray-100 text-gray-600 border-gray-200' };
      case 'mortgaged': return { label: 'Đang thế chấp', color: 'bg-rose-100 text-rose-800 border-rose-200' };
      default: return { label: status, color: 'bg-gray-100 text-gray-800 border-gray-200' };
    }
  };

  const renderBadge = (props: { label: string, color: string }, title: string) => (
    <span 
      title={title}
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        props.color
      )}
    >
      {props.label}
    </span>
  );

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {renderBadge(getCustodyProps(custody_status), "Lưu kho")}
      {renderBadge(getLifecycleProps(lifecycle_status), "Vòng đời")}
      {renderBadge(getSaleProps(sale_status), "Kinh doanh")}
      {renderBadge(getMortgageProps(mortgage_status), "Thế chấp")}
    </div>
  );
};
