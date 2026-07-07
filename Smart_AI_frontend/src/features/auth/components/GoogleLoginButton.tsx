import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { useAuthStore } from "@/stores/authStore";

const GoogleLoginButton: React.FC = () => {
  const buttonRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const location = useLocation();

  const { setAuth } = useAuthStore();

  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    console.log("========== GOOGLE LOGIN ==========");
    console.log("Current Origin:", window.location.origin);
    console.log("Client ID:", clientId);
    console.log("API:", import.meta.env.VITE_API_BASE_URL);
    console.log("==============================");

    if (!clientId) {
      setError("Không tìm thấy VITE_GOOGLE_CLIENT_ID");
      return;
    }

    const initializeGoogle = () => {
      if (!window.google) {
        console.log("Google script chưa load...");
        setTimeout(initializeGoogle, 500);
        return;
      }

      if (!buttonRef.current) return;

      try {
        buttonRef.current.innerHTML = "";

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
        });

        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          width: 350,
          shape: "rectangular",
        });

        console.log("Google button rendered");
      } catch (err) {
        console.error(err);
        setError("Không thể khởi tạo Google Login");
      }
    };

    initializeGoogle();
  }, []);

  const handleCredentialResponse = async (response: any) => {
    try {
      setIsLoading(true);
      setError("");

      console.log("Google credential received");

      const api = `${import.meta.env.VITE_API_BASE_URL.replace(
        "/api",
        "",
      )}/api/auth/google-login`;

      console.log("POST:", api);

      const res = await axios.post(api, {
        credential: response.credential,
      });

      console.log(res.data);

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
      console.error(err);

      setError(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          err.message ||
          "Đăng nhập Google thất bại",
      );
    } finally {
      setIsLoading(false);
    }
  };

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
