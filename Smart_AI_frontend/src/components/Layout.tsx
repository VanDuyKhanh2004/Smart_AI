import React from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import CompareBar from '@/components/CompareBar';

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * Layout Component - Main application layout wrapper
 * Requirements: 1.1 - Clean header layout with new Header component
 */
const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Bỏ qua đến nội dung chính
      </a>

      {/* Header - New redesigned header component */}
      <Header />

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className="container mx-auto flex-1 px-8 focus:outline-none">
        {children}
      </main>

      {/* CompareBar - Requirements: 1.4, 2.3 */}
      {/* Shows only when compare list is not empty (handled inside CompareBar) */}
      <CompareBar />

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Layout;
