import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

// Đọc file .env nếu có để nạp giá trị cấu hình thật
const envPath = path.resolve(__dirname, '.env');
const envMap: Record<string, string> = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let val = (match[2] || '').trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      envMap[match[1]] = val;
      process.env[match[1]] = val;
    }
  }
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env': {},
      ...(envMap['VITE_SUPABASE_URL']
        ? {'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(envMap['VITE_SUPABASE_URL'])}
        : {}),
      ...(envMap['VITE_SUPABASE_ANON_KEY']
        ? {'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(envMap['VITE_SUPABASE_ANON_KEY'])}
        : {}),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
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
