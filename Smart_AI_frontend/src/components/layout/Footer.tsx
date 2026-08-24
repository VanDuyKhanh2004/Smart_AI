import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail } from 'lucide-react';
import { SiFacebook, SiInstagram } from '@icons-pack/react-simple-icons';

const FOOTER_NAV = [
  { to: '/products', label: 'Sản phẩm' },
  { to: '/stores', label: 'Cửa hàng' },
] as const;

const Footer: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/40" role="contentinfo">
      <div className="container mx-auto px-8 py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-3">
            <Link to="/" className="inline-block font-bold text-lg text-foreground hover:opacity-80 transition-opacity">
              Smart AI
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Nền tảng mua sắm điện thoại thông minh với hỗ trợ AI, giúp bạn tìm được sản phẩm phù hợp nhất.
            </p>
          </div>

          {/* Navigation */}
          <nav aria-label="Liên kết nhanh">
            <h3 className="text-sm font-semibold text-foreground mb-3">Liên kết nhanh</h3>
            <ul className="space-y-2">
              {FOOTER_NAV.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Liên hệ</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="tel:0984499302"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>0984499302</span>
                </a>
              </li>
              <li>
                <a
                  href="mailto:duykhanhpro04@gmail.com"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>duykhanhpro04@gmail.com</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Kết nối với chúng tôi</h3>
            <div className="flex items-center gap-3">
              <a
                href="https://www.facebook.com/duykhanh.van.988?locale=vi_VN"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-foreground hover:text-background transition-colors duration-200"
              >
                <SiFacebook className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href="https://www.instagram.com/duykhanh.van.988/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-foreground hover:text-background transition-colors duration-200"
              >
                <SiInstagram className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 border-t pt-6 text-center text-xs text-muted-foreground">
          &copy; {year} Smart AI. Tất cả quyền được bảo lưu.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
