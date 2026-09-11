import re

with open('src/components/RequestModal.tsx', 'r') as f:
    text = f.read()

# I want to change the checkbox logic to only show for "Nhập Chuyển nhượng" if role is capital_dept
# Oh wait, the prompt says: "Với reason = 'chuyển nhượng' (chỉ hiện với capital_dept khi chọn Nhập kho), hiện thêm ô chọn pháp nhân đích ... và ô chọn CĐT/NĐT"

# Let's find the checkin form logic
old_checkin = """              {['capital_dept', 'admin', 'super_admin'].includes(userRole) && (
                <div className="pt-2 border-t border-gray-100">
                  <label className="flex items-center space-x-2 mb-3">
                    <input type="checkbox" checked={updateOwnership} onChange={e => setUpdateOwnership(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm font-medium text-gray-700">Đồng thời cập nhật chủ sở hữu mới</span>
                  </label>
                  
                  {updateOwnership && (
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Pháp nhân chủ sở hữu *</label>
                        <select required value={newOwnerEntityId} onChange={e => setNewOwnerEntityId(e.target.value)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500">
                          <option value="">-- Chọn pháp nhân --</option>
                          {investorEntities.map(e => (
                            <option key={e.id} value={e.id}>{e.name} ({e.company_code})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Phân loại *</label>
                        <select required value={newOwnerRole} onChange={e => setNewOwnerRole(e.target.value as any)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500">
                          <option value="cdt">Chủ đầu tư (CĐT)</option>
                          <option value="ndt">Nhà đầu tư (NĐT)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}"""

new_checkin = """              {selectedOpt.reason === 'chuyển nhượng' && ['capital_dept', 'admin', 'super_admin'].includes(userRole) && (
                <div className="pt-2 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Pháp nhân đích (Chủ sở hữu mới) *</label>
                      <select required value={newOwnerEntityId} onChange={e => {
                        setNewOwnerEntityId(e.target.value);
                        setUpdateOwnership(true);
                      }} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500">
                        <option value="">-- Chọn pháp nhân --</option>
                        {investorEntities.map(e => (
                          <option key={e.id} value={e.id}>{e.name} ({e.company_code})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Phân loại *</label>
                      <select required value={newOwnerRole} onChange={e => setNewOwnerRole(e.target.value as any)} className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500">
                        <option value="cdt">Chủ đầu tư (CĐT)</option>
                        <option value="ndt">Nhà đầu tư (NĐT)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}"""

text = text.replace(old_checkin, new_checkin)

with open('src/components/RequestModal.tsx', 'w') as f:
    f.write(text)

