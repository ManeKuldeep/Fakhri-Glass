import type { ActivityLogRow } from '../queries';
import { formatActivityLog, FormattedActivityLog } from './formatActivityLog';

export interface OrderActivityEvent {
  log: ActivityLogRow;
  formatted: FormattedActivityLog;
}

export interface OrderActivityGroup {
  type: 'order_group';
  id: string;
  orderNo: number | null;
  customerName: string | null;
  store: string | null;
  currentStatus: string | null;
  latestCreatedAt: string;
  latestUser: string;
  latestAssignment: string;
  events: OrderActivityEvent[];
}

export interface SingleActivityItem {
  type: 'single';
  id: string;
  log: ActivityLogRow;
  formatted: FormattedActivityLog;
}

export type DisplayActivityItem = OrderActivityGroup | SingleActivityItem;

function asJsonObject(val: unknown): Record<string, unknown> | null {
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return null;
}

function extractOrderIdentifier(item: ActivityLogRow): {
  orderId: string | null;
  orderNo: number | null;
  customerName: string | null;
  store: string | null;
  status: string | null;
} {
  const table = item.table_name?.toLowerCase() ?? '';
  const summary = item.summary ?? '';
  const newData = asJsonObject(item.new_data);
  const oldData = asJsonObject(item.old_data);

  let orderId: string | null = null;
  let orderNo: number | null = null;
  let customerName: string | null = null;
  let store: string | null = null;
  let status: string | null = null;

  // 1. Table: orders
  if (table === 'orders') {
    if (item.record_id) orderId = item.record_id;
    const rawNo = newData?.order_no ?? oldData?.order_no;
    if (typeof rawNo === 'number') orderNo = rawNo;
    else if (typeof rawNo === 'string') orderNo = parseInt(rawNo, 10) || null;

    if (newData?.customer_name) customerName = String(newData.customer_name);
    if (newData?.store) store = String(newData.store);
    if (newData?.status) status = String(newData.status);
  }

  // 2. Table: order_items
  if (table === 'order_items') {
    const rawOrderId = newData?.order_id ?? oldData?.order_id;
    if (rawOrderId && typeof rawOrderId === 'string') {
      orderId = rawOrderId;
    }
  }

  // 3. Table: cut_plans
  if (table === 'cut_plans') {
    const rawOrderId = newData?.order_id ?? oldData?.order_id;
    if (rawOrderId && typeof rawOrderId === 'string') {
      orderId = rawOrderId;
    }
  }

  // 4. Parse "Order #1234" from summary text
  const match = summary.match(/order\s*#(\d+)/i);
  if (match) {
    const parsedNo = parseInt(match[1], 10);
    if (!Number.isNaN(parsedNo) && !orderNo) {
      orderNo = parsedNo;
    }
  }

  return { orderId, orderNo, customerName, store, status };
}

/**
 * Groups raw chronological activity log rows so that multiple actions
 * belonging to the same order are consolidated into 1 unified record card.
 */
export function groupActivityLogs(logs: ActivityLogRow[]): DisplayActivityItem[] {
  const result: DisplayActivityItem[] = [];
  const orderGroupMap = new Map<string, OrderActivityGroup>();
  const idAliasMap = new Map<string, string>();

  for (const log of logs) {
    const formatted = formatActivityLog(log);
    const { orderId, orderNo, customerName, store, status } = extractOrderIdentifier(log);

    let groupId: string | null = null;
    if (orderNo && idAliasMap.has(`no:${orderNo}`)) {
      groupId = idAliasMap.get(`no:${orderNo}`)!;
    } else if (orderId && idAliasMap.has(`id:${orderId}`)) {
      groupId = idAliasMap.get(`id:${orderId}`)!;
    }

    if (!groupId && (orderNo || orderId)) {
      groupId = orderNo ? `order_no:${orderNo}` : `order_id:${orderId}`;
    }

    if (groupId) {
      if (orderNo) idAliasMap.set(`no:${orderNo}`, groupId);
      if (orderId) idAliasMap.set(`id:${orderId}`, groupId);

      const assignment = log.user_assignment
        ? log.user_assignment.charAt(0).toUpperCase() + log.user_assignment.slice(1)
        : 'Shop';
      const userName = log.user_name || 'System';

      let group = orderGroupMap.get(groupId);
      if (!group) {
        group = {
          type: 'order_group',
          id: groupId,
          orderNo,
          customerName,
          store,
          currentStatus: status,
          latestCreatedAt: log.created_at,
          latestUser: userName,
          latestAssignment: assignment,
          events: [],
        };
        orderGroupMap.set(groupId, group);
        result.push(group);
      }

      group.events.push({ log, formatted });
      if (!group.orderNo && orderNo) group.orderNo = orderNo;
      if (!group.customerName && customerName) group.customerName = customerName;
      if (!group.store && store) group.store = store;
      if (!group.currentStatus && status) group.currentStatus = status;
    } else {
      // Non-order event (e.g. stock, system login, category edit)
      result.push({
        type: 'single',
        id: String(log.id),
        log,
        formatted,
      });
    }
  }

  return result;
}
