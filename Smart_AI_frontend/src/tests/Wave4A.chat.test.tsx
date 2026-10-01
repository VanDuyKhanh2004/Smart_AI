import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { act } from 'react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import ChatWindow from '@/features/chat/components/ChatWindow';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/shadcn-io/ai/code-block';
import type { ChatMessage as ChatMessageType } from '@/services/chat.service';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

vi.mock('@/services/chatHistory.service', () => ({
  getConversation: vi.fn(),
  hydrateMessages: vi.fn(),
}));

vi.mock('react-syntax-highlighter', () => ({
  Prism: ({
    language,
    showNumbers,
    codeTagProps,
    className,
    children,
  }: {
    language: string;
    showNumbers?: boolean;
    codeTagProps?: { className?: string };
    className?: string;
    children: ReactNode;
  }) => {
    void showNumbers;
    return (
      <pre className={className} data-language={language}>
        <code className={codeTagProps?.className}>{children}</code>
      </pre>
    );
  },
}));

const PANEL_SELECTOR = '[aria-label="Chat với CSKH ĐTGK"]';
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function makeMessages(): ChatMessageType[] {
  return [
    {
      id: 'm1',
      role: 'user',
      content: 'Tôi cần hỗ trợ',
      timestamp: new Date('2024-01-01T00:00:00.000Z'),
    },
    {
      id: 'm2',
      role: 'assistant',
      content: 'Chào bạn, chúng tôi có thể giúp gì?',
      timestamp: new Date('2024-01-01T00:00:01.000Z'),
    },
  ];
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onMinimize: vi.fn(),
    messages: makeMessages(),
    isConnected: true,
    isProcessing: false,
    isActiveGeneration: false,
    error: null,
    onSendMessage: vi.fn(() => true),
    onStopGeneration: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
}

function getPanel(): HTMLElement {
  const panel = document.querySelector(PANEL_SELECTOR);
  expect(panel).not.toBeNull();
  return panel as HTMLElement;
}

function installClipboard(writeImpl: () => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText: vi.fn().mockImplementation(writeImpl) },
  });
}

beforeAll(() => {
  if (!HTMLElement.prototype.scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      writable: true,
      configurable: true,
      value: vi.fn(),
    });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('W4-M01/M11 composer and copy control names', () => {
  it('gives the composer textarea and send button accessible names', () => {
    render(<ChatWindow {...baseProps()} />);

    expect(screen.getByRole('textbox', { name: 'Tin nhắn' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi tin nhắn' })).toBeInTheDocument();
  });

  it('labels the copy control and announces successful copy politely', async () => {
    installClipboard(() => Promise.resolve());

    render(
      <CodeBlock code="const x = 1;" language="typescript">
        <CodeBlockCopyButton />
      </CodeBlock>,
    );

    const button = screen.getByRole('button', { name: 'Sao chép mã' });
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Đã sao chép mã');
    });
  });

  it('announces a copy failure politely', async () => {
    installClipboard(() => Promise.reject(new Error('denied')));

    render(
      <CodeBlock code="const x = 1;" language="typescript">
        <CodeBlockCopyButton />
      </CodeBlock>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép mã' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Không thể sao chép mã');
    });
  });
});

describe('W4-M02/M04 chat panel focus management', () => {
  it('moves focus into the composer when the panel opens', async () => {
    const { rerender } = render(<ChatWindow {...baseProps({ isOpen: false })} />);
    expect(screen.queryByRole('textbox')).toBeNull();

    rerender(<ChatWindow {...baseProps({ isOpen: true })} />);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Tin nhắn' })).toHaveFocus();
    });
  });

  it('focuses the panel root when the composer is disabled on open', async () => {
    render(<ChatWindow {...baseProps({ isConnected: false })} />);

    await waitFor(() => {
      expect(getPanel()).toHaveFocus();
    });
  });

  it('restores focus into the panel when the composer becomes disabled while focused', async () => {
    const { rerender } = render(<ChatWindow {...baseProps()} />);
    const textarea = screen.getByRole('textbox', { name: 'Tin nhắn' }) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea).toHaveFocus());

    rerender(<ChatWindow {...baseProps({ isConnected: false })} />);
    // In a real browser, disabling the focused composer destroys focus and
    // activeElement falls to <body>. jsdom cannot blur an already-disabled
    // element, so re-enable it just long enough to reproduce that sequence.
    act(() => {
      textarea.disabled = false;
      textarea.blur();
      textarea.disabled = true;
    });
    fireEvent.focusOut(textarea, { bubbles: true });

    await waitFor(() => {
      expect(getPanel()).toHaveFocus();
    });
  });
});

describe('W4-M03 Escape and Tab containment', () => {
  it('hides via onHide on Escape without tearing down the panel itself', () => {
    const onHide = vi.fn();
    render(<ChatWindow {...baseProps({ onHide })} />);

    const panel = getPanel();
    fireEvent.keyDown(panel, { key: 'Escape' });

    expect(onHide).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Tin nhắn' })).toBeInTheDocument();
  });

  it('contains Tab and Shift+Tab within the panel on small viewports', () => {
    const previousMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('max-width: 640px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    try {
      render(<ChatWindow {...baseProps()} />);

      const panel = getPanel();
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      expect(focusables.length).toBeGreaterThan(1);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      last.focus();
      fireEvent.keyDown(last, { key: 'Tab' });
      expect(first).toHaveFocus();

      first.focus();
      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
      expect(last).toHaveFocus();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: previousMatchMedia,
      });
    }
  });
});

describe('W4-M02 focus returns to the trigger when FloatingChat closes', () => {
  it('focuses the FAB trigger after Escape closes the chat', async () => {
    const { default: FloatingChat } = await import('@/features/chat/components/FloatingChat');
    const { container } = render(<FloatingChat />);

    const toggle = container.querySelector('button.rounded-full') as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();

    fireEvent.click(toggle!);

    await waitFor(() => {
      expect(container.querySelector(PANEL_SELECTOR)).not.toBeNull();
    });
    const panel = container.querySelector(PANEL_SELECTOR) as HTMLElement;

    fireEvent.keyDown(panel, { key: 'Escape' });

    await waitFor(() => {
      expect(toggle).toHaveFocus();
    });
    expect(container.querySelector(PANEL_SELECTOR)).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
