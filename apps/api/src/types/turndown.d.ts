declare module 'turndown' {
  export default class TurndownService {
    constructor(options?: unknown);
    addRule(key: string, rule: unknown): this;
    use(plugin: unknown): this;
    turndown(html: string): string;
  }
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export function gfm(service: TurndownService): void;
}

