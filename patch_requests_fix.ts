import fs from 'fs';
let content = fs.readFileSync('src/pages/Requests.tsx', 'utf8');

content = content.replace(
  "        )}\n      </div>\n      \n      {reviewRequest && (",
  "      </div>\n      \n      {reviewRequest && ("
);

fs.writeFileSync('src/pages/Requests.tsx', content, 'utf8');
