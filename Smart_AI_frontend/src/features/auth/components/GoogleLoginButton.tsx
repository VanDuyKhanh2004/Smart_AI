import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { useAuthStore } from "@/stores/authStore";
import { initGoogleIdentity, setGoogleCallback, renderGoogleButton } from "@/lib/googleIdentity";
import { resolveBackendOrigin } from "@/lib/apiBaseUrl";

const GoogleLoginButton: React.FC = () => {
  const buttonRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const location = useLocation();

  const { setAuth } = useAuthStore();

  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const handleCredential = useCallback(async (credential: string) => {
    setIsLoading(true);
    setError("");

    try {
      const api = `${resolveBackendOrigin()}/api/auth/google-login`;

      const res = await axios.post(api, { credential });

      if (!res.data.success) {
        throw new Error("Đăng nhập thất bại");
      }

      const { user, accessToken, refreshToken } = res.data.data;

      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("refreshToken", refreshToken);

      setAuth(user, accessToken, refreshToken);

      navigate(from, {
        replace: true,
      });
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          err.message ||
          "Đăng nhập Google thất bại",
      );
    } finally {
      setIsLoading(false);
    }
  }, [from, setAuth]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId?.trim()) {
      setError("Không tìm thấy VITE_GOOGLE_CLIENT_ID");
      return;
    }

    initGoogleIdentity(clientId.trim());
    setGoogleCallback(handleCredential);
    renderGoogleButton(buttonRef.current);
  }, [handleCredential]);

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded bg-red-100 p-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div
        ref={buttonRef}
        className={isLoading ? "pointer-events-none opacity-50" : ""}
      />

      {isLoading && (
        <div className="text-center text-sm">Đang đăng nhập...</div>
      )}
    </div>
  );
};

export default GoogleLoginButton;
