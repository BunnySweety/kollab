/**
 * Yjs Singleton Module
 * 
 * This module ensures that Yjs is imported only once, preventing
 * the "Yjs was already imported" warning that occurs when multiple
 * modules import Yjs (e.g., y-websocket and our code).
 * 
 * Import Yjs from this module instead of directly from 'yjs'.
 */

// Import Yjs first, before any other modules that might import it
import * as Y from 'yjs';

// Re-export Yjs to ensure we use the same instance everywhere
export * from 'yjs';
export { Y };
export default Y;

