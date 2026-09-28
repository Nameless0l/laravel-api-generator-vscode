import { PageOptions, renderPage } from './ui/page';

export function getBuilderHtml(o: Omit<PageOptions, 'body' | 'bodyClass'>): string {
    return renderPage({ ...o, body: '<div id="app" class="app"></div>', bodyClass: 'builder-view' });
}
