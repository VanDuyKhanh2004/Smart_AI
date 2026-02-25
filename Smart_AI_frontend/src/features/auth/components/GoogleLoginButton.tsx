import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import axios from 'axios';

const GoogleLoginButton: React.FC = () => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth } = useAuthStore();

  // Get the redirect path from location state
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  useEffect(() => {
    // Wait for Google script to load
    const initializeGoogleSignIn = () => {
      if (window.google && buttonRef.current) {
        try {
          console.log('Initializing Google Sign-In with Client ID:', import.meta.env.VITE_GOOGLE_CLIENT_ID);
          
          window.google.accounts.id.initialize({
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
            callback: handleCredentialResponse,
          });

          window.google.accounts.id.renderButton(
            buttonRef.current,
            {
              theme: 'outline',
              size: 'large',
              text: 'signin_with',
              shape: 'rectangular',
              width: '100%'
            }
          );
          
          console.log('Google Sign-In button rendered successfully');
        } catch (err) {
          console.error('Google Sign-In initialization error:', err);
          setError('Không thể khởi tạo đăng nhập Google');
        }
      } else {
        console.log('Waiting for Google script to load...');
        // Retry after 500ms if Google script not loaded
        setTimeout(initializeGoogleSignIn, 500);
      }
    };

    // Start initialization
    initializeGoogleSignIn();
  }, []);

  const handleCredentialResponse = async (response: { credential: string }) => {
    console.log('Google credential received');
    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_API_BASE_URL.replace('/api', '')}/api/auth/google-login`;
      console.log('Sending credential to:', apiUrl);
      
      // Send credential to backend
      const result = await axios.post(apiUrl, { credential: response.credential });

      console.log('Backend response:', result.data);

      if (result.data.success) {
        const { user, accessToken, refreshToken } = result.data.data;

        // Save to localStorage
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));

        // Update auth store
        setAuth(user, accessToken, refreshToken);

        console.log('Login successful, redirecting to:', from);
        // Redirect to the page user was trying to access or home
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      console.error('Google login error:', err);
      console.error('Error response:', err.response?.data);
      const errorMessage = err.response?.data?.error?.message || 'Đăng nhập Google thất bại';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm text-center">
          {error}
        </div>
      )}
      
      <div 
        ref={buttonRef} 
        className={`w-full flex justify-center ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
      />
      
      {isLoading && (
        <div className="text-center text-sm text-muted-foreground">
          Đang xử lý đăng nhập...
        </div>
      )}
    </div>
  );
};

export default GoogleLoginButton;
