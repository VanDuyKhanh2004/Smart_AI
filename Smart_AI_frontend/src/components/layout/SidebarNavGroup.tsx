import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface NavLink {
  to: string;
  label: string;
  icon: React.ReactNode;
}

export interface SidebarNavGroupProps {
  title: string;
  links: NavLink[];
  isCollapsed: boolean;
  onLinkClick?: () => void;
}

/**
 * SidebarNavGroup Component - Reusable navigation group for admin sidebar
 * Requirements: 2.1 - Group links into categories
 * Requirements: 2.2 - Show icon and label for each link in expanded state
 * Requirements: 2.3 - Show only icons with tooltip on hover when collapsed
 * Requirements: 2.4 - Highlight active link with distinct styling
 * Requirements: 6.2 - Hover effect with background color change
 * Requirements: 6.3 - Active link with primary color and left border indicator
 */
const SidebarNavGroup: React.FC<SidebarNavGroupProps> = ({
  title,
  links,
  isCollapsed,
  onLinkClick,
}) => {
  const location = useLocation();

  const isActiveLink = (path: string): boolean => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="space-y-1">
      {/* Group Title - Hidden when collapsed */}
      {!isCollapsed && (
        <h3 className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
      )}

      {/* Navigation Links */}
      <nav className="space-y-1">
        {links.map((link) => {
          const isActive = isActiveLink(link.to);
          
          return (
            <div key={link.to} className="relative group">
              <Link
                to={link.to}
                onClick={onLinkClick}
                className={cn(
                  // Base styles
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium',
                  // Smooth transitions for all interactions - Requirements: 6.2, 6.3
                  'transition-all duration-200 ease-in-out',
                  // Centered icons when collapsed
                  isCollapsed ? 'justify-center' : '',
                  // Active state - Requirements: 6.3: Primary color and left border indicator
                  // Using sidebar-specific CSS variables for theme consistency
                  isActive
                    ? [
                        'bg-sidebar-primary/10 text-sidebar-primary',
                        // Left border indicator for active link
                        'border-l-[3px] border-sidebar-primary',
                        // Slight shadow for depth
                        'shadow-sm',
                      ]
                    : [
                        'text-sidebar-foreground/70',
                        // Transparent left border to prevent layout shift on hover/active
                        'border-l-[3px] border-transparent',
                        // Hover effect - Requirements: 6.2: Background color change
                        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        // Subtle border on hover
                        'hover:border-l-[3px] hover:border-sidebar-accent-foreground/20',
                      ]
                )}
              >
                {/* Icon with transition */}
                <span className={cn(
                  'flex-shrink-0 transition-transform duration-200',
                  // Slight scale effect on hover for non-active links
                  !isActive && 'group-hover:scale-110',
                  // Using sidebar-specific primary color for active state
                  isActive ? 'text-sidebar-primary' : ''
                )}>
                  {link.icon}
                </span>
                {/* Label with transition */}
                {!isCollapsed && (
                  <span className="transition-colors duration-200">
                    {link.label}
                  </span>
                )}
              </Link>

              {/* Tooltip on hover when collapsed - Requirements: 2.3 */}
              {isCollapsed && (
                <div
                  className={cn(
                    'absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50',
                    'px-3 py-1.5 rounded-md text-sm font-medium',
                    'bg-popover text-popover-foreground border shadow-lg',
                    // Smooth fade transition for tooltip
                    'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
                    'transition-all duration-200 ease-in-out',
                    // Slight translate animation on appear
                    'translate-x-1 group-hover:translate-x-0',
                    'whitespace-nowrap',
                    // Pointer events to prevent tooltip from blocking clicks
                    'pointer-events-none'
                  )}
                >
                  {link.label}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
};

export default SidebarNavGroup;
