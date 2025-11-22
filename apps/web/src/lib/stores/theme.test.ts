import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true
}));

describe('Theme Store', () => {
	beforeEach(() => {
		// Clear localStorage
		localStorage.clear();
		
		// Reset document classes
		document.documentElement.classList.remove('dark');
		
		// Clear all mocks
		vi.clearAllMocks();
	});

	// We need to dynamically import to ensure mocks are applied
	const getThemeStore = async () => {
		const module = await import('./theme');
		return module.theme;
	};

	it('should initialize with system theme by default', async () => {
		const theme = await getThemeStore();
		const value = get(theme);
		expect(value).toBe('system');
	});

	it('should load theme from localStorage', async () => {
		localStorage.setItem('notion-clone-theme', 'dark');
		
		// Re-import to get fresh store
		vi.resetModules();
		const theme = await getThemeStore();
		const value = get(theme);
		
		expect(value).toBe('dark');
	});

	it('should set theme and save to localStorage', async () => {
		const theme = await getThemeStore();
		
		theme.set('dark');
		
		expect(localStorage.getItem('notion-clone-theme')).toBe('dark');
		expect(get(theme)).toBe('dark');
		expect(document.documentElement.classList.contains('dark')).toBe(true);
	});

	it('should toggle between light and dark', async () => {
		const theme = await getThemeStore();
		
		theme.set('light');
		expect(get(theme)).toBe('light');
		expect(document.documentElement.classList.contains('dark')).toBe(false);
		
		theme.toggle();
		expect(get(theme)).toBe('dark');
		expect(document.documentElement.classList.contains('dark')).toBe(true);
		
		theme.toggle();
		expect(get(theme)).toBe('light');
		expect(document.documentElement.classList.contains('dark')).toBe(false);
	});

	it('should apply system theme based on media query', async () => {
		// Mock matchMedia for dark mode
		Object.defineProperty(window, 'matchMedia', {
			writable: true,
			value: vi.fn().mockImplementation((query) => ({
				matches: query === '(prefers-color-scheme: dark)',
				media: query,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn()
			}))
		});

		vi.resetModules();
		const theme = await getThemeStore();
		
		theme.set('system');
		theme.init();
		
		expect(document.documentElement.classList.contains('dark')).toBe(true);
	});

	it('should handle invalid localStorage values', async () => {
		localStorage.setItem('notion-clone-theme', 'invalid-value');
		
		vi.resetModules();
		const theme = await getThemeStore();
		const value = get(theme);
		
		// Should default to 'system' for invalid values
		expect(value).toBe('system');
	});

	it('should save theme to localStorage when toggling', async () => {
		const theme = await getThemeStore();
		
		theme.set('light');
		theme.toggle();
		
		expect(localStorage.getItem('notion-clone-theme')).toBe('dark');
	});
});

