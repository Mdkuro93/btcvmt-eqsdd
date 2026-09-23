import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

// Đọc file .env, .env.local hoặc .env.example để nạp cấu hình Supabase
const envFiles = ['.env', '.env.local', '.env.example'];
const envMap: Record<string, string> = {};

for (const f of envFiles) {
  const p = path.resolve(__dirname, f);
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = (match[2] || '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (val) {
          const looksLikeValidUrl = /^https?:\/\/.*supabase\.co/.test(val);
          const looksLikePlaceholder = val.includes('your-project') || val.includes('your-anon-key') || val === 'undefined';
          const isUrlField = match[1] === 'VITE_SUPABASE_URL';
          const isAcceptable = isUrlField ? looksLikeValidUrl : (val.length > 20 && !looksLikePlaceholder);
          if (isAcceptable && !envMap[match[1]]) {
            envMap[match[1]] = val;
            process.env[match[1]] = val;
          }
        }
      }
    }
  }
}

// Giá trị mặc định dự phòng chuẩn
const SUPABASE_URL = envMap['VITE_SUPABASE_URL'] || 'https://dkzfjwrrlnupdflrxxao.supabase.co';
const SUPABASE_ANON_KEY = envMap['VITE_SUPABASE_ANON_KEY'] || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremZqd3JybG51cGRmbHJ4eGFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MTgxNTgsImV4cCI6MjEwMzk5NDE1OH0.gaOgF8u-_rkg2qNsT2jePAFrjDyTHyXK58hZHwTGvRQ';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env': {},
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(SUPABASE_ANON_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'lucide-react',
        'date-fns',
        'clsx',
        'tailwind-merge',
        'react-hot-toast',
      ],
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});