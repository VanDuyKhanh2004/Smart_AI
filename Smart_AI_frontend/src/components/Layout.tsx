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
      {/* Header - New redesigned header component */}
      <Header />

      {/* Main Content */}
      <main className="container mx-auto flex-1 px-8">{children}</main>

      {/* CompareBar - Requirements: 1.4, 2.3 */}
      {/* Shows only when compare list is not empty (handled inside CompareBar) */}
      <CompareBar />

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Layout;
