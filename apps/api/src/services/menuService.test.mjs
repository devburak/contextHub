import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  emitDomainEvent: vi.fn(),
  triggerWebhooksForTenant: vi.fn(),
};

let Menu;
let menuService;
let setMenuEventDeps;

beforeAll(async () => {
  ({ Menu } = await import('@contexthub/common/src/models'));
  menuService = (await import('./menuService')).default;
  setMenuEventDeps = menuService.__setMenuEventDeps;
});

afterAll(() => {
  setMenuEventDeps();
});

function createMenuDoc() {
  const item = { _id: 'item-1', parentId: null, order: 0 };
  return {
    _id: 'menu-1',
    slug: 'main-menu',
    name: 'Main menu',
    location: 'header',
    status: 'active',
    meta: { totalItems: 1 },
    updatedAt: new Date('2026-07-27T10:00:00.000Z'),
    addItem: vi.fn().mockResolvedValue(undefined),
    updateItem: vi.fn().mockResolvedValue(undefined),
    deleteItem: vi.fn().mockResolvedValue(undefined),
    reorderItems: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    getItem: vi.fn(() => item),
    toObject: vi.fn(function toObject() {
      return {
        _id: this._id,
        slug: this.slug,
        name: this.name,
        location: this.location,
        status: this.status,
        meta: this.meta,
        updatedAt: this.updatedAt,
      };
    }),
  };
}

describe('menuService webhook producers', () => {
  let menu;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.emitDomainEvent.mockReset().mockResolvedValue('event-id');
    mocks.triggerWebhooksForTenant.mockReset();
    setMenuEventDeps(mocks);
    menu = createMenuDoc();
    vi.spyOn(Menu, 'findOne').mockResolvedValue(menu);
  });

  it.each([
    ['add item', () => menuService.addMenuItem('tenant-1', 'menu-1', { title: 'News' }, 'user-1')],
    ['update item', () => menuService.updateMenuItem('tenant-1', 'menu-1', 'item-1', { title: 'Updates' }, 'user-1')],
    ['delete item', () => menuService.deleteMenuItem('tenant-1', 'menu-1', 'item-1', 'user-1')],
    ['reorder items', () => menuService.reorderMenuItems('tenant-1', 'menu-1', [{ id: 'item-1', order: 1 }], 'user-1')],
    ['move item', () => menuService.moveMenuItem('tenant-1', 'menu-1', 'item-1', null, 2, 'user-1')],
  ])('emits menu.updated and schedules delivery after %s', async (_label, mutate) => {
    await mutate();

    expect(mocks.emitDomainEvent).toHaveBeenCalledTimes(1);
    expect(mocks.emitDomainEvent).toHaveBeenCalledWith(
      'tenant-1',
      'menu.updated',
      expect.objectContaining({
        menuId: 'menu-1',
        slug: 'main-menu',
        location: 'header',
      }),
      {
        triggeredBy: 'user',
        source: 'admin-ui',
        userId: 'user-1',
      }
    );
    expect(mocks.triggerWebhooksForTenant).toHaveBeenCalledWith('tenant-1');
  });
});
