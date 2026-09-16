import fs from 'fs';
let content = fs.readFileSync('src/pages/Requests.tsx', 'utf8');

// The `{activeTab === 'giao_dich' ? (<>` was placed right before `overdueAssets`. But we need the Tabs to be at the top!
// Actually, I put the Tabs around line 352 because it replaced `<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">`.
// But `{activeTab === 'giao_dich' ? (<>` was put around `overdueAssets` which is BEFORE the Tabs.
// Let's remove `{activeTab === 'giao_dich' ? (<>` from line 332.

content = content.replace("{activeTab === 'giao_dich' ? (<>\n      {overdueAssets.length > 0", "{overdueAssets.length > 0");

// And move `{activeTab === 'giao_dich' ? (<>` to be AFTER the tabs.
// The Tabs end with:
/*
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
*/
// We can change that.
content = content.replace(
  /<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">/g,
  `{activeTab === 'giao_dich' ? (<>\n      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">`
);

// Wait, the replace string for Tabs earlier did:
// content.replace(/<div className="flex flex-col .../, renderTabs + `\n      <div className="flex flex-col ...`)
// That means there are two matches or something? Let's be precise.

fs.writeFileSync('src/pages/Requests.tsx', content, 'utf8');
