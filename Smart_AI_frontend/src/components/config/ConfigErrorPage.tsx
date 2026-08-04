import type { ApiConfigState } from '@/lib/apiBaseUrl';

interface ConfigErrorPageProps {
  state: Extract<ApiConfigState, { status: 'missing' | 'invalid' }>;
}

export function ConfigErrorPage({ state }: ConfigErrorPageProps) {
  const title =
    state.status === 'missing'
      ? 'Thiếu cấu hình API'
      : 'Cấu hình API không hợp lệ';

  const description =
    state.status === 'missing'
      ? 'Biến môi trường VITE_API_BASE_URL chưa được cấu hình trên môi trường triển khai.'
      : 'Giá trị VITE_API_BASE_URL không phải là một URL HTTP/HTTPS hợp lệ.';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow">
        <h1 className="text-lg font-semibold text-red-600">{title}</h1>
        <p className="mt-2 text-sm text-gray-600">{description}</p>
        <p className="mt-4 text-sm text-gray-500">
          Vui lòng kiểm tra biến môi trường VITE_API_BASE_URL trên Vercel (ví dụ
          https://&lt;backend-domain&gt;/api) rồi triển khai lại ứng dụng.
        </p>
      </div>
    </div>
  );
}
