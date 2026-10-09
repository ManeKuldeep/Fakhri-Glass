import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderCutPlan } from '../queries';
import {
  calculateAreaSqFt,
  calculateAreaSqM,
  formatInches,
  formatMm,
  getAspectRatioInfo,
} from '../../inventory/utils';

export interface OrderCutVisualizerModalProps {
  visible: boolean;
  onClose: () => void;
  orderNo: number;
  customerName?: string;
  plans: OrderCutPlan[];
  showFtIn?: boolean;
}

interface SheetLayout {
  sheetId: string;
  source: string;
  widthMm: number;
  heightMm: number;
  isLining: boolean;
  productName: string;
  thicknessMm: number;
  color: string | null;
  kerfMm: number;
  pieces: {
    id: string;
    xMm: number;
    yMm: number;
    wMm: number;
    hMm: number;
    rotated: boolean;
    orderItemId: string;
  }[];
}

/**
 * Modal to visualize exactly how pieces were cut from physical main sheets/offcuts.
 */
export default function OrderCutVisualizerModal({
  visible,
  onClose,
  orderNo,
  customerName,
  plans,
  showFtIn = false,
}: OrderCutVisualizerModalProps) {
  const insets = useSafeAreaInsets();
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const dimFormat = showFtIn ? formatInches : formatMm;

  // Group cut pieces by their physical stock sheet across all product plans
  const sheets: SheetLayout[] = useMemo(() => {
    const sheetMap = new Map<string, SheetLayout>();

    for (const plan of plans) {
      const prod = plan.product;
      const prodName = prod?.name ?? 'Glass';
      const thickness = prod?.thickness_mm ?? 5;
      const color = prod?.color ?? null;
      const isLining = prod?.is_lining ?? false;

      for (const piece of plan.cut_pieces) {
        const stock = piece.stock_item;
        const sheetId = piece.stock_item_id;
        const widthMm = stock?.width_mm ?? 2440;
        const heightMm = stock?.height_mm ?? 1830;
        const source = stock?.source ?? 'full';

        let existing = sheetMap.get(sheetId);
        if (!existing) {
          existing = {
            sheetId,
            source,
            widthMm,
            heightMm,
            isLining,
            productName: prodName,
            thicknessMm: thickness,
            color,
            kerfMm: plan.kerf_mm,
            pieces: [],
          };
          sheetMap.set(sheetId, existing);
        }

        existing.pieces.push({
          id: piece.id,
          xMm: piece.x_mm,
          yMm: piece.y_mm,
          wMm: piece.w_mm,
          hMm: piece.h_mm,
          rotated: piece.rotated,
          orderItemId: piece.order_item_id,
        });
      }
    }

    return Array.from(sheetMap.values());
  }, [plans]);

  const activeSheet = sheets[activeSheetIndex] ?? sheets[0];

  // Canvas scaling: fit sheet within max 300 × 200 pt
  const canvasMaxW = 300;
  const canvasMaxH = 200;

  const { scaledW, scaledH, scale } = useMemo(() => {
    if (!activeSheet) {
      return { scaledW: canvasMaxW, scaledH: canvasMaxH, scale: 1 };
    }
    const safeW = Math.max(activeSheet.widthMm, 1);
    const safeH = Math.max(activeSheet.heightMm, 1);
    const calculatedScale = Math.min((canvasMaxW - 12) / safeW, (canvasMaxH - 12) / safeH);
    return {
      scaledW: Math.max(Math.round(safeW * calculatedScale), 60),
      scaledH: Math.max(Math.round(safeH * calculatedScale), 60),
      scale: calculatedScale,
    };
  }, [activeSheet]);

  // Statistics for active sheet
  const sheetStats = useMemo(() => {
    if (!activeSheet) return null;
    const totalAreaMm = activeSheet.widthMm * activeSheet.heightMm;
    const pieceAreaMm = activeSheet.pieces.reduce((sum, p) => sum + p.wMm * p.hMm, 0);

    const sheetSqFt = calculateAreaSqFt(activeSheet.widthMm, activeSheet.heightMm);
    const pieceSqFt = Number((pieceAreaMm / 92903.04).toFixed(2));
    const usedPct = totalAreaMm > 0 ? Math.round((pieceAreaMm / totalAreaMm) * 100) : 0;
    const leftoverSqFt = Math.max(Number((sheetSqFt - pieceSqFt).toFixed(2)), 0);

    return {
      sheetSqFt,
      pieceSqFt,
      leftoverSqFt,
      usedPct,
      pieceCount: activeSheet.pieces.length,
    };
  }, [activeSheet]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        {/* Header with notch/status bar spacing */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.navBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
          </Pressable>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Main Sheet Cut Layout</Text>
            <Text style={styles.subtitle}>
              Order #{orderNo}
              {customerName ? ` · ${customerName}` : ''}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={styles.navBtn}>
            <MaterialCommunityIcons name="close" size={20} color="#0F172A" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {sheets.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="content-cut"
                size={48}
                color="#CBD5E1"
              />
              <Text style={styles.emptyTitle}>No Cut Plans Recorded</Text>
              <Text style={styles.emptySubtitle}>
                This order has not been confirmed through the cutting optimiser yet.
              </Text>
            </View>
          ) : (
            <>
              {/* Sheet Selector (if multiple sheets) */}
              {sheets.length > 1 && (
                <View style={styles.sheetSelector}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {sheets.map((s, idx) => {
                      const isSelected = idx === activeSheetIndex;
                      return (
                        <Pressable
                          key={s.sheetId}
                          style={[
                            styles.sheetTab,
                            isSelected && styles.sheetTabActive,
                          ]}
                          onPress={() => setActiveSheetIndex(idx)}
                        >
                          <MaterialCommunityIcons
                            name={s.source === 'full' ? 'layers-outline' : 'crop'}
                            size={14}
                            color={isSelected ? '#1A73E8' : '#64748B'}
                          />
                          <Text
                            style={[
                              styles.sheetTabText,
                              isSelected && styles.sheetTabTextActive,
                            ]}
                          >
                            Sheet {idx + 1} ({s.source === 'full' ? 'Full' : 'Offcut'})
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Active Sheet Card */}
              {activeSheet && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.productName}>
                        {activeSheet.productName} ({activeSheet.thicknessMm} mm)
                      </Text>
                      <Text style={styles.sheetMeta}>
                        {activeSheet.source === 'full' ? 'Full Sheet' : 'Offcut Sheet'} ·{' '}
                        {dimFormat(activeSheet.widthMm)} × {dimFormat(activeSheet.heightMm)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor:
                            activeSheet.source === 'full' ? '#ECFDF5' : '#FFFBEB',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color:
                              activeSheet.source === 'full' ? '#059669' : '#D97706',
                          },
                        ]}
                      >
                        {activeSheet.source === 'full' ? 'Full Sheet' : 'Offcut'}
                      </Text>
                    </View>
                  </View>

                  {/* ── Main Sheet Visual Stage ── */}
                  <View style={styles.stageWrapper}>
                    {/* Width callout at top */}
                    <View style={styles.dimCalloutTop}>
                      <MaterialCommunityIcons name="arrow-left" size={12} color="#64748B" />
                      <Text style={styles.dimCalloutText}>
                        Sheet Width: {dimFormat(activeSheet.widthMm)}
                      </Text>
                      <MaterialCommunityIcons name="arrow-right" size={12} color="#64748B" />
                    </View>

                    <View style={styles.stageBody}>
                      {/* Height callout at left */}
                      <View style={styles.dimCalloutLeft}>
                        <MaterialCommunityIcons name="arrow-up" size={12} color="#64748B" />
                        <Text style={styles.dimCalloutTextVert}>
                          {dimFormat(activeSheet.heightMm)}
                        </Text>
                        <MaterialCommunityIcons name="arrow-down" size={12} color="#64748B" />
                      </View>

                      {/* The Physical Sheet Rectangle */}
                      <View
                        style={[
                          styles.sheetCanvas,
                          {
                            width: scaledW,
                            height: scaledH,
                            backgroundColor:
                              activeSheet.source === 'full' ? '#F8FAFC' : '#FFFDF5',
                            borderColor:
                              activeSheet.source === 'full' ? '#94A3B8' : '#F59E0B',
                          },
                        ]}
                      >
                        {/* Fluting if Figured Glass */}
                        {activeSheet.isLining && (
                          <View style={styles.flutesRow}>
                            {Array.from({
                              length: Math.max(Math.floor(scaledW / 14), 4),
                            }).map((_, i) => (
                              <View key={i} style={styles.fluteStripe} />
                            ))}
                          </View>
                        )}

                        {/* Cut Pieces Placed On Sheet */}
                        {activeSheet.pieces.map((piece, pIdx) => {
                          const pLeft = Math.round(piece.xMm * scale);
                          const pTop = Math.round(piece.yMm * scale);
                          const pWidth = Math.max(Math.round(piece.wMm * scale), 14);
                          const pHeight = Math.max(Math.round(piece.hMm * scale), 14);

                          return (
                            <View
                              key={piece.id}
                              style={[
                                styles.cutPieceRect,
                                {
                                  left: pLeft,
                                  top: pTop,
                                  width: pWidth,
                                  height: pHeight,
                                },
                              ]}
                            >
                              <Text
                                style={styles.pieceNumberText}
                                numberOfLines={1}
                              >
                                #{pIdx + 1}
                              </Text>
                              {pWidth >= 36 && pHeight >= 22 && (
                                <Text
                                  style={styles.pieceDimsText}
                                  numberOfLines={1}
                                >
                                  {piece.wMm}×{piece.hMm}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  </View>

                  {/* ── Sheet Utilization Metrics ── */}
                  {sheetStats && (
                    <View style={styles.statsGrid}>
                      <View style={styles.statBox}>
                        <MaterialCommunityIcons
                          name="view-grid-outline"
                          size={18}
                          color="#1A73E8"
                        />
                        <Text style={styles.statVal}>{sheetStats.pieceCount}</Text>
                        <Text style={styles.statLbl}>Pieces Cut</Text>
                      </View>

                      <View style={styles.statBox}>
                        <MaterialCommunityIcons
                          name="chart-arc"
                          size={18}
                          color="#059669"
                        />
                        <Text style={styles.statVal}>{sheetStats.usedPct}%</Text>
                        <Text style={styles.statLbl}>Utilized</Text>
                      </View>

                      <View style={styles.statBox}>
                        <MaterialCommunityIcons
                          name="chart-box-outline"
                          size={18}
                          color="#7C3AED"
                        />
                        <Text style={styles.statVal}>{sheetStats.pieceSqFt} sq ft</Text>
                        <Text style={styles.statLbl}>Glass Used</Text>
                      </View>

                      <View style={styles.statBox}>
                        <MaterialCommunityIcons
                          name="recycle"
                          size={18}
                          color="#D97706"
                        />
                        <Text style={styles.statVal}>{sheetStats.leftoverSqFt} sq ft</Text>
                        <Text style={styles.statLbl}>Offcut Leftover</Text>
                      </View>
                    </View>
                  )}

                  {/* ── Cut Pieces Legend List ── */}
                  <Text style={styles.breakdownTitle}>Pieces on this sheet:</Text>
                  {activeSheet.pieces.map((p, idx) => {
                    const aspect = getAspectRatioInfo(p.wMm, p.hMm);
                    const pSqFt = calculateAreaSqFt(p.wMm, p.hMm);
                    const pSqM = calculateAreaSqM(p.wMm, p.hMm);

                    return (
                      <View key={p.id} style={styles.pieceRow}>
                        <View style={styles.pieceIndexBadge}>
                          <Text style={styles.pieceIndexText}>#{idx + 1}</Text>
                        </View>
                        <View style={styles.pieceRowInfo}>
                          <Text style={styles.pieceRowSize}>
                            {dimFormat(p.wMm)} × {dimFormat(p.hMm)}
                            {p.rotated ? ' (Rotated 90°)' : ''}
                          </Text>
                          <Text style={styles.pieceRowMeta}>
                            Position: X={p.xMm}mm, Y={p.yMm}mm · {aspect.orientation}
                          </Text>
                        </View>
                        <View style={styles.pieceRowArea}>
                          <Text style={styles.pieceRowAreaText}>{pSqFt} sq ft</Text>
                          <Text style={styles.pieceRowAreaSub}>{pSqM} m²</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}

          <Pressable style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Close Layout</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
    paddingHorizontal: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 30,
  },
  sheetSelector: {
    marginBottom: 12,
  },
  sheetTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 8,
  },
  sheetTabActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  sheetTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  sheetTabTextActive: {
    color: '#1A73E8',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  sheetMeta: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  dimCalloutTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  dimCalloutText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  stageBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimCalloutLeft: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  dimCalloutTextVert: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
    marginVertical: 4,
  },
  sheetCanvas: {
    borderWidth: 2,
    borderRadius: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  flutesRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'stretch',
  },
  fluteStripe: {
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(217, 119, 6, 0.18)',
  },
  cutPieceRect: {
    position: 'absolute',
    backgroundColor: 'rgba(37, 99, 235, 0.16)',
    borderColor: '#2563EB',
    borderWidth: 1.5,
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 1,
    overflow: 'hidden',
  },
  pieceNumberText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E40AF',
  },
  pieceDimsText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  statVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 4,
  },
  statLbl: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  breakdownTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pieceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pieceIndexBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginRight: 10,
  },
  pieceIndexText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  pieceRowInfo: {
    flex: 1,
  },
  pieceRowSize: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  pieceRowMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  pieceRowArea: {
    alignItems: 'flex-end',
  },
  pieceRowAreaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  pieceRowAreaSub: {
    fontSize: 10,
    color: '#64748B',
  },
  doneBtn: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
