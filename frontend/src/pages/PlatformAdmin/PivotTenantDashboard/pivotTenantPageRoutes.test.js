import {
  PIVOT_TENANT_PAGES,
  PIVOT_TENANT_PAGE_IDS,
  pivotTenantPageId,
  pivotTenantPageIndex,
} from './pivotTenantPageRoutes';

describe('Pivot tenant dashboard route contract', () => {
  it('keeps every legacy index assigned to one stable page identity', () => {
    expect(PIVOT_TENANT_PAGE_IDS).toHaveLength(13);
    expect(PIVOT_TENANT_PAGES.locationMigration).toBe(7);
    expect(PIVOT_TENANT_PAGES.carousel).toBe(8);
    expect(PIVOT_TENANT_PAGES.notifications).toBe(9);
    expect(PIVOT_TENANT_PAGES.computeJobs).toBe(10);
    expect(PIVOT_TENANT_PAGES.analytics).toBe(11);
    PIVOT_TENANT_PAGE_IDS.forEach((id, index) => {
      expect(pivotTenantPageId(index)).toBe(id);
      expect(pivotTenantPageIndex(id)).toBe(index);
    });
  });
});
