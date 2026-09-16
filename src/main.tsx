import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Xử lý tự động khi trình duyệt gặp lỗi nạp chunk động từ Vite (preload error)
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const retryKey = 'vite_preload_error_reload';
  if (!sessionStorage.getItem(retryKey)) {
    sessionStorage.setItem(retryKey, 'true');
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
