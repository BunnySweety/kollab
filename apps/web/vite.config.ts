import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 3000,
		strictPort: false,
		host: true
	},
	preview: {
		port: 3000,
		strictPort: false,
		host: true
	},
	optimizeDeps: {
		exclude: ['@tiptap/core', '@tiptap/pm', 'y-protocols'],
		// Include yjs to prevent duplicate imports
		include: ['yjs', 'y-websocket']
	},
	resolve: {
		// Deduplicate yjs to ensure single instance
		dedupe: ['yjs', 'y-websocket']
	},
	build: {
		chunkSizeWarningLimit: 600,
		rollupOptions: {
			output: {
				manualChunks: (id) => {
					// Split vendor code into separate chunk
					if (id.includes('node_modules')) {
						if (id.includes('lucide-svelte')) {
							return 'icons';
						}
						if (id.includes('bits-ui') || id.includes('cmdk-sv')) {
							return 'ui-components';
						}
						// Other node_modules go to vendor
						return 'vendor';
					}
				}
			}
		}
	}
});