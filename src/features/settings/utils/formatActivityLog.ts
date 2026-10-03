import type { ActivityLogRow } from '../queries';

export type ActivityLogIcon =
  | 'delete-outline'
  | 'plus-circle-outline'
  | 'pencil-outline'
  | 'clipboard-text-outline'
  | 'clock-outline'
  | 'package-variant-closed'
  | 'account-plus-outline'
  | 'account-edit-outline'
  | 'content-cut'
  | 'tag-outline'
  | 'cloud-download-outline'
  | 'login'
  | 'logout'
  | 'printer-outline'
  | 'bell-outline';

export interface FormattedActivityLog {
  badge: {
    label: string;
    color: string;
    bg: string;
    border: string;
    icon: ActivityLogIcon;
  };
  entity: string;
  title: string;
  details: string | null;
}

function asJsonObject(val: unknown): Record<string, unknown> | null {
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return null;
}

function capitalize(s?: string | null): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

function formatStoreName(store?: string | null): string {
  if (!store) return '';
  const lower = store.toLowerCase();
  if (lower === 'mumbai') return 'Mumbai Store';
  if (lower === 'sanpada') return 'Sanpada Store';
  return `${capitalize(store)} Store`;
}

export function formatActivityLog(item: ActivityLogRow): FormattedActivityLog {
  const table = item.table_name?.toLowerCase() ?? '';
  const action = item.action?.toLowerCase() ?? '';
  const summary = item.summary?.trim() ?? '';
  const newData = asJsonObject(item.new_data);
  const oldData = asJsonObject(item.old_data);

  // ── 1. Stock items (Inventory) ──
  if (table === 'stock_items') {
    const isRemoved =
      newData?.status === 'removed' ||
      action === 'delete' ||
      summary.toLowerCase().includes(', removed)');

    // Regex parse trigger summary: e.g. "Clear Glass 5mm 2440×1220 mm (full, removed)"
    const stockMatch = summary.match(
      /^(.*?)\s+(\d+)\s*[×x]\s*(\d+)\s*mm\s*\((full|offcut),\s*(\w+)\)$/i,
    );

    let product = 'Sheet';
    let dimensions = '';
    let sheetType = '';

    if (stockMatch) {
      product = stockMatch[1];
      dimensions = `${stockMatch[2]} × ${stockMatch[3]} mm`;
      sheetType = stockMatch[4].toLowerCase() === 'full' ? 'Full sheet' : 'Offcut';
    } else if (summary) {
      // Clean off trailing (source, status)
      product = summary.replace(/\s*\([^)]*\)$/, '');
    }

    if (isRemoved) {
      return {
        badge: {
          label: 'REMOVED',
          color: '#DC2626',
          bg: '#FEF2F2',
          border: '#FECACA',
          icon: 'delete-outline',
        },
        entity: 'Inventory',
        title: `Removed ${product} from Stock`,
        details: [dimensions, sheetType].filter(Boolean).join(' · ') || 'Sheet marked as removed',
      };
    }

    if (action === 'insert') {
      return {
        badge: {
          label: 'ADDED',
          color: '#059669',
          bg: '#ECFDF5',
          border: '#A7F3D0',
          icon: 'plus-circle-outline',
        },
        entity: 'Inventory',
        title: `Added ${product} to Stock`,
        details: [dimensions, sheetType].filter(Boolean).join(' · ') || 'New sheet added',
      };
    }

    return {
      badge: {
        label: 'UPDATED',
        color: '#1A73E8',
        bg: '#EFF6FF',
        border: '#BFDBFE',
        icon: 'pencil-outline',
      },
      entity: 'Inventory',
      title: `Updated ${product}`,
      details: [dimensions, sheetType].filter(Boolean).join(' · ') || 'Stock item updated',
    };
  }

  // ── 2. Orders ──
  if (table === 'orders') {
    // Regex parse summary: e.g. "Order #1002 · mumbai · new"
    const orderMatch = summary.match(/^Order\s*#?(\d+)?(?:\s*·\s*([^·]+))?(?:\s*·\s*([^·]+))?$/i);
    const orderNo =
      (newData?.order_no as string | number | undefined) ??
      (orderMatch ? orderMatch[1] : '') ??
      '';
    const rawStore =
      (newData?.store as string | undefined) ??
      (orderMatch ? orderMatch[2]?.trim() : '') ??
      '';
    const rawStatus =
      (newData?.status as string | undefined) ??
      (orderMatch ? orderMatch[3]?.trim() : '') ??
      '';

    const storeStr = formatStoreName(rawStore);
    const statusStr = rawStatus ? `Status: ${capitalize(rawStatus)}` : '';

    if (action === 'insert') {
      return {
        badge: {
          label: 'NEW ORDER',
          color: '#059669',
          bg: '#ECFDF5',
          border: '#A7F3D0',
          icon: 'clipboard-text-outline',
        },
        entity: 'Orders',
        title: orderNo ? `Order #${orderNo} Placed` : 'New Order Created',
        details: [storeStr, statusStr].filter(Boolean).join(' · ') || 'Order created',
      };
    }

    if (action === 'update') {
      const oldStatus = oldData?.status as string | undefined;
      const newStatus = newData?.status as string | undefined;
      const isStatusChange = oldStatus && newStatus && oldStatus !== newStatus;

      if (isStatusChange) {
        return {
          badge: {
            label: 'STATUS',
            color: '#D97706',
            bg: '#FFFBEB',
            border: '#FDE68A',
            icon: 'clock-outline',
          },
          entity: 'Orders',
          title: orderNo ? `Order #${orderNo} Status Updated` : 'Order Status Changed',
          details: `Status: ${capitalize(newStatus)}${storeStr ? ` · ${storeStr}` : ''}`,
        };
      }

      return {
        badge: {
          label: 'UPDATED',
          color: '#1A73E8',
          bg: '#EFF6FF',
          border: '#BFDBFE',
          icon: 'pencil-outline',
        },
        entity: 'Orders',
        title: orderNo ? `Order #${orderNo} Updated` : 'Order Updated',
        details: [storeStr, statusStr].filter(Boolean).join(' · ') || 'Order details modified',
      };
    }
  }

  // ── 3. Order items ──
  if (table === 'order_items') {
    // Regex parse summary: e.g. "Clear Glass 5mm 1200×600 mm, qty 2"
    const itemMatch = summary.match(/^(.*?)\s+(\d+)\s*[×x]\s*(\d+)\s*mm,\s*qty\s+(\d+)$/i);

    let product = 'Item';
    let dimensions = '';
    let qty = '';

    if (itemMatch) {
      product = itemMatch[1];
      dimensions = `${itemMatch[2]} × ${itemMatch[3]} mm`;
      qty = itemMatch[4];
    } else {
      product = summary || 'Order piece';
    }

    if (action === 'insert') {
      return {
        badge: {
          label: 'ITEM ADDED',
          color: '#4F46E5',
          bg: '#EEF2FF',
          border: '#C7D2FE',
          icon: 'package-variant-closed',
        },
        entity: 'Order Items',
        title: qty ? `Added ${qty} pcs of ${product}` : `Added ${product}`,
        details: dimensions ? `${dimensions}${qty ? ` · Qty: ${qty}` : ''}` : 'Added to order',
      };
    }

    if (action === 'delete') {
      return {
        badge: {
          label: 'ITEM REMOVED',
          color: '#DC2626',
          bg: '#FEF2F2',
          border: '#FECACA',
          icon: 'delete-outline',
        },
        entity: 'Order Items',
        title: `Removed ${product} from Order`,
        details: dimensions ? `${dimensions}${qty ? ` · Qty: ${qty}` : ''}` : 'Item removed',
      };
    }

    return {
      badge: {
        label: 'ITEM UPDATED',
        color: '#1A73E8',
        bg: '#EFF6FF',
        border: '#BFDBFE',
        icon: 'pencil-outline',
      },
      entity: 'Order Items',
      title: `Updated ${product}`,
      details: dimensions ? `${dimensions}${qty ? ` · Qty: ${qty}` : ''}` : 'Item details modified',
    };
  }

  // ── 4. Customers ──
  if (table === 'customers') {
    const customerName = summary || (newData?.name as string | undefined) || 'Customer';
    const phone = newData?.phone as string | undefined;

    if (action === 'insert') {
      return {
        badge: {
          label: 'CUSTOMER',
          color: '#0D9488',
          bg: '#F0FDFA',
          border: '#99F6E4',
          icon: 'account-plus-outline',
        },
        entity: 'Customers',
        title: `New Customer: ${customerName}`,
        details: phone ? `Phone: ${phone}` : 'Added to customer records',
      };
    }

    return {
      badge: {
        label: 'CUSTOMER',
        color: '#0D9488',
        bg: '#F0FDFA',
        border: '#99F6E4',
        icon: 'account-edit-outline',
      },
      entity: 'Customers',
      title: `Updated Customer: ${customerName}`,
      details: phone ? `Phone: ${phone}` : 'Customer profile updated',
    };
  }

  // ── 5. Cut plans ──
  if (table === 'cut_plans') {
    const cutProduct = summary.replace(/^Cut plan\s*·\s*/i, '').trim();
    return {
      badge: {
        label: 'CUT PLAN',
        color: '#7C3AED',
        bg: '#F5F3FF',
        border: '#DDD6FE',
        icon: 'content-cut',
      },
      entity: 'Cutting',
      title: cutProduct ? `Cut Plan: ${cutProduct}` : 'Cut Plan Generated',
      details: 'Cutting layout generated / confirmed',
    };
  }

  // ── 6. Categories & Products ──
  if (table === 'categories' || table === 'products') {
    const isCategory = table === 'categories';
    const entityType = isCategory ? 'Category' : 'Product';
    const actionLabel = action === 'insert' ? 'Added' : 'Updated';
    return {
      badge: {
        label: 'CATALOG',
        color: '#2563EB',
        bg: '#EFF6FF',
        border: '#BFDBFE',
        icon: 'tag-outline',
      },
      entity: 'Catalog',
      title: `${actionLabel} ${entityType}: ${summary || 'Catalog Item'}`,
      details: 'Catalog updated',
    };
  }

  // ── 7. System & App Events ──
  if (table === 'app' || action === 'event') {
    const lowerSummary = summary.toLowerCase();

    if (lowerSummary.includes('backup')) {
      return {
        badge: {
          label: 'BACKUP',
          color: '#6366F1',
          bg: '#EEF2FF',
          border: '#C7D2FE',
          icon: 'cloud-download-outline',
        },
        entity: 'System',
        title: 'Shop Data Backup Exported',
        details: 'Full database backup exported to JSON',
      };
    }

    if (lowerSummary === 'login') {
      return {
        badge: {
          label: 'LOGIN',
          color: '#059669',
          bg: '#ECFDF5',
          border: '#A7F3D0',
          icon: 'login',
        },
        entity: 'System',
        title: 'User Signed In',
        details: 'App session started',
      };
    }

    if (lowerSummary === 'logout') {
      return {
        badge: {
          label: 'LOGOUT',
          color: '#64748B',
          bg: '#F1F5F9',
          border: '#E2E8F0',
          icon: 'logout',
        },
        entity: 'System',
        title: 'User Signed Out',
        details: 'App session ended',
      };
    }

    if (lowerSummary.includes('label')) {
      return {
        badge: {
          label: 'LABEL',
          color: '#0284C7',
          bg: '#F0F9FF',
          border: '#BAE6FD',
          icon: 'printer-outline',
        },
        entity: 'System',
        title: 'Piece Labels Printed',
        details: 'Cutting labels generated',
      };
    }

    return {
      badge: {
        label: 'EVENT',
        color: '#7C3AED',
        bg: '#F5F3FF',
        border: '#DDD6FE',
        icon: 'bell-outline',
      },
      entity: 'System',
      title: summary || 'System event recorded',
      details: null,
    };
  }

  // ── 8. Fallback ──
  const friendlyEntity = table
    ? table
        .split('_')
        .map((w) => capitalize(w))
        .join(' ')
    : 'System';

  const defaultActionMap: Record<
    string,
    { label: string; color: string; bg: string; border: string; icon: ActivityLogIcon }
  > = {
    insert: {
      label: 'ADDED',
      color: '#059669',
      bg: '#ECFDF5',
      border: '#A7F3D0',
      icon: 'plus-circle-outline',
    },
    update: {
      label: 'UPDATED',
      color: '#1A73E8',
      bg: '#EFF6FF',
      border: '#BFDBFE',
      icon: 'pencil-outline',
    },
    delete: {
      label: 'REMOVED',
      color: '#DC2626',
      bg: '#FEF2F2',
      border: '#FECACA',
      icon: 'delete-outline',
    },
  };

  const badge = defaultActionMap[action] ?? {
    label: action.toUpperCase() || 'LOG',
    color: '#64748B',
    bg: '#F8FAFC',
    border: '#E2E8F0',
    icon: 'bell-outline',
  };

  return {
    badge,
    entity: friendlyEntity,
    title: summary || 'Activity recorded',
    details: null,
  };
}
