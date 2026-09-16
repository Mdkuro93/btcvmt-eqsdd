import fs from 'fs';
let content = fs.readFileSync('src/pages/Requests.tsx', 'utf8');

// Add import
content = content.replace(
  "import { fetchDeclarationRequests, approveDeclarationRequest, rejectDeclarationRequest } from '../api/assetDeclarationRequests';",
  "import { fetchDeclarationRequests, approveDeclarationRequest, rejectDeclarationRequest } from '../api/assetDeclarationRequests';\nimport { ReviewDeclarationRequestModal } from '../components/ReviewDeclarationRequestModal';"
);

// Add state
content = content.replace(
  "  const [loadingDeclarations, setLoadingDeclarations] = useState(false);",
  "  const [loadingDeclarations, setLoadingDeclarations] = useState(false);\n  const [reviewRequest, setReviewRequest] = useState<any>(null);"
);

// Add action buttons
const oldActions = `                      {isApprover && req.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleRejectDeclaration(req)} className="px-3 py-1 rounded text-red-700 hover:bg-red-50 border border-red-200 font-semibold">Từ chối</button>
                          <button onClick={() => handleApproveDeclaration(req)} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm">Duyệt</button>
                        </div>
                      )}`;
const newActions = `                      <div className="flex justify-end gap-2">
                        <button onClick={() => setReviewRequest(req)} className="px-3 py-1 rounded text-blue-700 hover:bg-blue-50 border border-blue-200 font-semibold">Chi tiết</button>
                        {isApprover && req.status === 'pending' && (
                          <>
                            <button onClick={() => handleRejectDeclaration(req)} className="px-3 py-1 rounded text-red-700 hover:bg-red-50 border border-red-200 font-semibold">Từ chối</button>
                            <button onClick={() => handleApproveDeclaration(req)} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm">Duyệt</button>
                          </>
                        )}
                      </div>`;
content = content.replace(oldActions, newActions);

// Add modal component
const newTabContent = `
        )}
      </div>
      
      {reviewRequest && (
        <ReviewDeclarationRequestModal
          isOpen={!!reviewRequest}
          onClose={() => setReviewRequest(null)}
          onSuccess={loadDeclarationRequests}
          request={reviewRequest}
        />
      )}
      </>) : (`;
content = content.replace("      </div>\n      </>) : (", newTabContent);

fs.writeFileSync('src/pages/Requests.tsx', content, 'utf8');
