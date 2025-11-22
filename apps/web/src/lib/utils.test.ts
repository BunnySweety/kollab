import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn utility', () => {
	it('should merge class names', () => {
		const result = cn('class1', 'class2');
		expect(result).toBe('class1 class2');
	});

	it('should handle conditional classes', () => {
		const isActive = true;
		const isHidden = false;
		const result = cn('base', isActive && 'active', isHidden && 'hidden');
		expect(result).toBe('base active');
	});

	it('should handle tailwind conflicts', () => {
		const result = cn('px-2', 'px-4');
		expect(result).toBe('px-4');
	});

	it('should handle arrays', () => {
		const result = cn(['class1', 'class2'], 'class3');
		expect(result).toBe('class1 class2 class3');
	});

	it('should handle objects', () => {
		const result = cn({ active: true, hidden: false });
		expect(result).toBe('active');
	});

	it('should handle empty inputs', () => {
		const result = cn('', null, undefined);
		expect(result).toBe('');
	});
});

