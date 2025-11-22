/**
 * TipTap Editor Types
 * Type-safe interfaces for TipTap JSON content structure
 */

export interface TiptapMark {
  type: 'bold' | 'italic' | 'code' | 'link' | 'strike' | 'underline' | 'highlight';
  attrs?: {
    href?: string;
    target?: string;
    class?: string;
    [key: string]: unknown;
  };
}

export interface TiptapNode {
  type: string;
  text?: string;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  attrs?: {
    level?: number;
    checked?: boolean;
    src?: string;
    alt?: string;
    title?: string;
    language?: string;
    [key: string]: unknown;
  };
}

export interface TiptapDocument {
  type: 'doc';
  content?: TiptapNode[];
}

export type TiptapContent = TiptapDocument | TiptapNode;

