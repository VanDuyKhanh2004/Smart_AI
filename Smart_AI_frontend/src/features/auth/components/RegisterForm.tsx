import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore, type RegisterResult } from '@/stores/authStore';
import { useResendCooldown } from '@/hooks/useResendCooldown';

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

const RegisterForm: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [registeredResult, setRegisteredResult] = useState<RegisterResult | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const {
    remainingSeconds,
    isOnCooldown,
    isSending,
    startCooldown,
    startSending,
    stopSending,
  } = useResendCooldown();
  
  const { register, resendVerification, isLoading, error, clearError } = useAuthStore();

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!name.trim()) {
      newErrors.name = 'Tên là bắt buộc';
    } else if (name.trim().length < 2) {
      newErrors.name = 'Tên phải có ít nhất 2 ký tự';
    }
    
    if (!email.trim()) {
      newErrors.email = 'Email là bắt buộc';
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      newErrors.email = 'Email không hợp lệ';
    }
    
    if (!password) {
      newErrors.password = 'Mật khẩu là bắt buộc';
    } else if (password.length < 6) {
      newErrors.password = 'Mật khẩu phải có ít nhất 6 ký tự';
    }
    
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Xác nhận mật khẩu là bắt buộc';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu không khớp';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setRegisteredResult(null);
    setRecoveryEmail(null);
    setResendMessage(null);
    setResendError(null);
    
    if (!validateForm()) {
      return;
    }
    
    try {
      const result = await register(name, email, password);
      setRegisteredResult(result);
      startCooldown(result.resendCooldownSeconds ?? 60);
    } catch (err) {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        setRecoveryEmail(email);
      }
    }
  };

  const handleResend = async () => {
    setResendMessage(null);
    setResendError(null);

    const resendTarget = recoveryEmail ?? email;
    if (!resendTarget.trim()) {
      setResendError('Vui lòng nhập email để gửi lại');
      return;
    }

    startSending();
    try {
      const message = await resendVerification(resendTarget);
      setResendMessage(message);
      startCooldown(60);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gửi lại thất bại';
      setResendError(message);
      const retryAfterSeconds = (err as Error & { retryAfterSeconds?: number }).retryAfterSeconds;
      if (typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
        startCooldown(retryAfterSeconds);
      }
    } finally {
      stopSending();
    }
  };

  const clearFieldError = (field: keyof FormErrors) => {
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Đăng ký</CardTitle>
        <CardDescription>
          Tạo tài khoản mới để sử dụng hệ thống
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Họ và tên
            </label>
            <Input
              id="name"
              type="text"
              placeholder="Nguyễn Văn A"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearFieldError('name');
              }}
              aria-invalid={!!errors.name}
              disabled={isLoading}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError('email');
              }}
              aria-invalid={!!errors.email}
              disabled={isLoading}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Mật khẩu
            </label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError('password');
              }}
              aria-invalid={!!errors.password}
              disabled={isLoading}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Xác nhận mật khẩu
            </label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                clearFieldError('confirmPassword');
              }}
              aria-invalid={!!errors.confirmPassword}
              disabled={isLoading}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword}</p>
            )}
          </div>
          
          {error && !recoveryEmail && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {(registeredResult || recoveryEmail) && (
            <div
              className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700"
              data-testid={recoveryEmail ? 'register-recovery' : 'register-success'}
            >
              <p className="font-semibold">
                {recoveryEmail
                  ? 'Tài khoản này đã được đăng ký nhưng chưa được xác nhận email.'
                  : 'Đăng ký thành công. Vui lòng kiểm tra email và xác nhận tài khoản trước khi đăng nhập.'}
              </p>
              <p>
                {recoveryEmail
                  ? 'Email xác nhận đã được gửi trước đó. Bạn có thể gửi lại email xác nhận đến'
                  : 'Chúng tôi đã gửi email xác nhận đến'}{' '}
                <span className="font-medium">{recoveryEmail ?? registeredResult?.email}</span>.
              </p>
              {recoveryEmail ? (
                <p>Vui lòng xác nhận email để kích hoạt tài khoản trước khi đăng nhập.</p>
              ) : (
                <p>Bạn cần xác nhận email trước khi có thể đăng nhập và sử dụng tài khoản.</p>
              )}
            </div>
          )}

          {resendMessage && (
            <div className="p-3 rounded-md bg-emerald-500/10 text-emerald-700 text-sm">
              {resendMessage}
            </div>
          )}

          {resendError && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {resendError}
            </div>
          )}
          
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Đang đăng ký...
              </>
            ) : (
              'Đăng ký'
            )}
          </Button>

          {(registeredResult || recoveryEmail) && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={isLoading || isOnCooldown || isSending}
            >
              {isSending
                ? 'Đang gửi...'
                : isOnCooldown
                  ? `Gửi lại sau ${remainingSeconds}s`
                  : 'Gửi lại email xác nhận'}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
};

export default RegisterForm;
