export const DEFAULT_PAGE_SIZE = 50;
export const PAGE_SIZE_OPTIONS = [25, 50, 100];

export function pageCount(total: number, pageSize: number) {
  if (total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPage(page: number, total: number, pageSize: number) {
  return Math.min(Math.max(1, page), pageCount(total, pageSize));
}

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const currentPage = clampPage(page, items.length, pageSize);
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
