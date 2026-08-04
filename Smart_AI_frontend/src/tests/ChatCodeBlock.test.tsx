import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/shadcn-io/ai/code-block';
import { Response } from '@/components/ui/shadcn-io/ai/response';
import { ToolInput } from '@/components/ui/shadcn-io/ai/tool';

vi.mock('react-syntax-highlighter', () => ({
  Prism: ({
    language,
    showLineNumbers,
    codeTagProps,
    className,
    children,
  }: {
    language: string;
    showLineNumbers?: boolean;
    codeTagProps?: { className?: string };
    className?: string;
    children: ReactNode;
  }) => {
    void showLineNumbers;
    return (
      <pre className={className} data-language={language}>
        <code className={codeTagProps?.className} data-testid="syntax-highlighter">
          {children}
        </code>
      </pre>
    );
  },
}));

const CODE_SAMPLE = [
  'const greet = (name: string) => {',
  '  return `Hello, ${name}!`;',
  '};',
].join('\n');

function renderCodeBlock() {
  return render(
    <CodeBlock code={CODE_SAMPLE} language="typescript">
      <CodeBlockCopyButton
        onCopy={vi.fn()}
        onError={vi.fn()}
        aria-label="Copy code"
      />
    </CodeBlock>
  );
}

function installClipboardMock(rejectedWith?: Error) {
  const clipboard = window.navigator.clipboard;
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const installed = window.navigator.clipboard as unknown as {
      writeText: ReturnType<typeof vi.fn>;
    };
    return installed.writeText;
  }
  const writeText = vi
    .spyOn(clipboard, 'writeText')
    .mockImplementation(
      rejectedWith
        ? vi.fn().mockRejectedValue(rejectedWith)
        : vi.fn().mockResolvedValue(undefined)
    );
  return writeText;
}

function getFenceLanguages(): string[] {
  return screen
    .getAllByTestId('syntax-highlighter')
    .map((codeElement) => codeElement.parentElement?.getAttribute('data-language') ?? '');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('CodeBlock renders the complete multi-line code string', () => {
  it('renders the complete multi-line code string', () => {
    const { container } = renderCodeBlock();

    const codeElement = screen.getAllByTestId('syntax-highlighter')[0];
    expect(codeElement.textContent).toContain(CODE_SAMPLE);
    for (const line of CODE_SAMPLE.split('\n')) {
      expect(codeElement.textContent).toContain(line);
    }
    expect(container.textContent).toContain(CODE_SAMPLE);
  });
});

describe('CodeBlockCopyButton clipboard behavior', () => {
  it('copies the complete code string on click', async () => {
    const writeText = installClipboardMock();

    renderCodeBlock();

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await act(async () => {});

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(CODE_SAMPLE);
  });

  it('shows the success state after a successful copy', async () => {
    installClipboardMock();

    renderCodeBlock();

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await act(async () => {});

    expect(document.querySelector('.lucide-check')).not.toBeNull();
    expect(document.querySelector('.lucide-copy')).toBeNull();
  });

  it('resets the success state after the configured timeout', async () => {
    vi.useFakeTimers();
    installClipboardMock();

    renderCodeBlock();

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await act(async () => {});

    expect(document.querySelector('.lucide-check')).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(document.querySelector('.lucide-check')).toBeNull();
    expect(document.querySelector('.lucide-copy')).not.toBeNull();
  });

  it('invokes onError when the clipboard rejects the write', async () => {
    const clipboardError = new Error('Clipboard denied');
    installClipboardMock(clipboardError);

    renderCodeBlock();

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await act(async () => {});

    expect(document.querySelector('.lucide-check')).toBeNull();
    expect(document.querySelector('.lucide-copy')).not.toBeNull();
  });
});

describe('Response markdown code rendering (regression lock)', () => {
  it('locks current language behavior: a labeled ts fence still renders as language="javascript"', () => {
    render(<Response>{'```ts\nconst x = 1;\n```'}</Response>);

    const languages = getFenceLanguages();
    expect(languages.length).toBeGreaterThan(0);
    for (const language of languages) {
      expect(language).toBe('javascript');
    }
    const codeElement = screen.getAllByTestId('syntax-highlighter')[0];
    expect(codeElement.textContent).toContain('const x = 1;');
  });

  it('uses the javascript fallback for fenceless fenced code', () => {
    render(<Response>{'```\nnofence\n```'}</Response>);

    const languages = getFenceLanguages();
    expect(languages.length).toBeGreaterThan(0);
    for (const language of languages) {
      expect(language).toBe('javascript');
    }
    const codeElement = screen.getAllByTestId('syntax-highlighter')[0];
    expect(codeElement.textContent).toContain('nofence');
  });

  it('keeps inline code inline without rendering a block CodeBlock', () => {
    render(<Response>{'Use `inline code` here.'}</Response>);

    expect(screen.queryAllByTestId('syntax-highlighter')).toHaveLength(0);
    expect(screen.getByText('inline code')).toBeInTheDocument();
    expect(screen.getByText('inline code').tagName).toBe('CODE');
  });

  it('does not crash for an unknown language and uses the javascript fallback', () => {
    render(<Response>{'```foobar123\nzzz\n```'}</Response>);

    const languages = getFenceLanguages();
    expect(languages.length).toBeGreaterThan(0);
    for (const language of languages) {
      expect(language).toBe('javascript');
    }
    const codeElement = screen.getAllByTestId('syntax-highlighter')[0];
    expect(codeElement.textContent).toContain('zzz');
  });

  it('preserves formatted JSON and passes language="json" to CodeBlock via ToolInput', () => {
    const toolInput = {
      type: 'function',
      name: 'get_weather',
      parameters: { city: 'Hanoi' },
    };
    const formatted = JSON.stringify(toolInput, null, 2);

    render(<ToolInput input={toolInput} />);

    const languages = getFenceLanguages();
    expect(languages.length).toBeGreaterThan(0);
    for (const language of languages) {
      expect(language).toBe('json');
    }
    const codeElement = screen.getAllByTestId('syntax-highlighter')[0];
    expect(codeElement.textContent).toContain(formatted);
    expect(codeElement.textContent).toContain('"name": "get_weather"');
    expect(codeElement.textContent).toContain('"parameters": {');
  });
});
