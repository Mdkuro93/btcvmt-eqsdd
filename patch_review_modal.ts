import fs from 'fs';
let content = fs.readFileSync('src/components/ReviewDeclarationRequestModal.tsx', 'utf8');

content = content.replace(
  "import { createDeclarationRequest } from '../api/assetDeclarationRequests';",
  "import { updateDeclarationRequest } from '../api/assetDeclarationRequests';"
);

content = content.replace(
  "export const DeclareNewAssetModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {",
  "interface ReviewProps extends Props {\n  request: any;\n}\n\nexport const ReviewDeclarationRequestModal: React.FC<ReviewProps> = ({ isOpen, onClose, onSuccess, request }) => {"
);

// We need to populate the initial state from `request`.
// I will replace the state declarations with initial values from `request`.
// This requires careful replacement. I'll just write a script to rewrite it or use a complete replacement.
