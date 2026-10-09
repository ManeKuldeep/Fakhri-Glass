import React, { useMemo, useState } from 'react';
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
import {
  calculateAreaSqFt,
  calculateAreaSqM,
  formatInches,
  formatMm,
  getAspectRatioInfo,
} from '../utils';

// Standard sheet size for visual scale comparison (8 ft × 6 ft)
const STANDARD_SHEET_W = 2440;
const STANDARD_SHEET_H = 1830;

interface OffcutThumbnailProps {
  widthMm: number;
  heightMm: number;
  source: 'full' | 'offcut';
  isLining?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  onPress?: () => void;
}

/**
 * Compact proportional visual thumbnail for a sheet or offcut piece.
 * Shows aspect ratio, source tint, and vertical flutes for lining glass.
 */
export function OffcutThumbnail({
  widthMm,
  heightMm,
  source,
  isLining = false,
  maxWidth = 72,
  maxHeight = 52,
  onPress,
}: OffcutThumbnailProps) {
  const isOffcut = source === 'offcut';
  const borderColor = isOffcut ? '#F59E0B' : '#10B981';
  const bgColor = isOffcut ? '#FFFBEB' : '#ECFDF5';
  const fluteColor = isOffcut ? 'rgba(217, 119, 6, 0.28)' : 'rgba(5, 150, 105, 0.28)';

  // Calculate scaled dimensions inside bounded box
  const { rectW, rectH } = useMemo(() => {
    const safeW = Math.max(widthMm, 1);
    const safeH = Math.max(heightMm, 1);
    const scale = Math.min((maxWidth - 8) / safeW, (maxHeight - 8) / safeH);
    return {
      rectW: Math.max(Math.round(safeW * scale), 14),
      rectH: Math.max(Math.round(safeH * scale), 14),
    };
  }, [widthMm, heightMm, maxWidth, maxHeight]);

  // Number of vertical flute stripes to show for lining glass
  const fluteCount = useMemo(() => {
    if (!isLining) return 0;
    return Math.max(Math.floor(rectW / 8), 2);
  }, [isLining, rectW]);

  const content = (
    <View
      style={[
        styles.thumbnailContainer,
        { width: maxWidth, height: maxHeight },
      ]}
    >
      <View
        style={[
          styles.thumbnailPiece,
          {
            width: rectW,
            height: rectH,
            borderColor,
            backgroundColor: bgColor,
          },
        ]}
      >
        {/* Subtle glass reflection accent */}
        <View style={styles.glassSheen} />

        {/* Flute lines for Figured/Lining glass */}
        {isLining && (
          <View style={styles.flutesRow}>
            {Array.from({ length: fluteCount }).map((_, i) => (
              <View
                key={i}
                style={[styles.fluteStripe, { backgroundColor: fluteColor }]}
              />
            ))}
          </View>
        )}

        {/* Magnify icon hint */}
        {onPress && (
          <View style={styles.zoomHintIcon}>
            <MaterialCommunityIcons
              name="magnify"
              size={11}
              color={borderColor}
            />
          </View>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={6}
        style={({ pressed }) => [pressed && styles.thumbnailPressed]}
        accessibilityLabel="Inspect sheet dimensions"
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

export interface OffcutInspectionModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  categoryName: string;
  thicknessMm: number;
  color?: string | null;
  widthMm: number;
  heightMm: number;
  source: 'full' | 'offcut';
  isLining?: boolean;
  verticalLineHeightMm?: number | null;
  quantity?: number;
  showFtIn?: boolean;
}

/**
 * Detailed Sheet & Offcut Visualizer Modal.
 * Shows high-resolution scale preview, dual dimension readouts,
 * surface area (sq ft and m²), aspect ratio, and comparison with a standard sheet.
 */
export function OffcutInspectionModal({
  visible,
  onClose,
  title,
  categoryName,
  thicknessMm,
  color,
  widthMm,
  heightMm,
  source,
  isLining = false,
  verticalLineHeightMm,
  quantity = 1,
  showFtIn = false,
}: OffcutInspectionModalProps) {
  const insets = useSafeAreaInsets();
  const [compareWithFull, setCompareWithFull] = useState(false);
  const isOffcut = source === 'offcut';
  const themeColor = isOffcut ? '#D97706' : '#059669';
  const themeBg = isOffcut ? '#FEF3C7' : '#D1FAE5';

  const dimFormat = showFtIn ? formatInches : formatMm;
  const areaSqFt = calculateAreaSqFt(widthMm, heightMm);
  const areaSqM = calculateAreaSqM(widthMm, heightMm);
  const aspectInfo = getAspectRatioInfo(widthMm, heightMm);

  // Large preview canvas sizing (max 260 × 170)
  const canvasMaxW = 260;
  const canvasMaxH = 170;

  const { pieceW, pieceH, fullSheetW, fullSheetH } = useMemo(() => {
    if (compareWithFull) {
      // Scale against standard 2440 × 1830 mm
      const refW = Math.max(STANDARD_SHEET_W, widthMm);
      const refH = Math.max(STANDARD_SHEET_H, heightMm);
      const scale = Math.min(canvasMaxW / refW, canvasMaxH / refH);
      return {
        pieceW: Math.max(Math.round(widthMm * scale), 8),
        pieceH: Math.max(Math.round(heightMm * scale), 8),
        fullSheetW: Math.round(STANDARD_SHEET_W * scale),
        fullSheetH: Math.round(STANDARD_SHEET_H * scale),
      };
    }

    // Normal scale to fill preview canvas
    const safeW = Math.max(widthMm, 1);
    const safeH = Math.max(heightMm, 1);
    const scale = Math.min(canvasMaxW / safeW, canvasMaxH / safeH);
    return {
      pieceW: Math.max(Math.round(safeW * scale), 20),
      pieceH: Math.max(Math.round(safeH * scale), 20),
      fullSheetW: 0,
      fullSheetH: 0,
    };
  }, [compareWithFull, widthMm, heightMm]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        {/* Header with notch/status bar spacing */}
        <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.navBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#0F172A" />
          </Pressable>
          <View style={styles.modalHeaderLeft}>
            <Text style={styles.modalTitle}>{title}</Text>
            <View style={styles.modalSubRow}>
              <View style={[styles.badge, { backgroundColor: themeBg }]}>
                <Text style={[styles.badgeText, { color: themeColor }]}>
                  {isOffcut ? 'Offcut Sheet' : 'Full Sheet'}
                </Text>
              </View>
              <Text style={styles.modalCategory}>
                {categoryName} · {thicknessMm} mm{color ? ` · ${color}` : ''}
              </Text>
            </View>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={styles.navBtn}>
            <MaterialCommunityIcons name="close" size={20} color="#0F172A" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Visual Scale Canvas Card ── */}
          <View style={styles.canvasCard}>
            <View style={styles.canvasHeader}>
              <View style={styles.canvasTitleRow}>
                <MaterialCommunityIcons
                  name="ruler-square"
                  size={18}
                  color="#1A73E8"
                />
                <Text style={styles.canvasTitle}>Proportional Visualizer</Text>
              </View>

              {/* Compare toggle */}
              <Pressable
                style={[
                  styles.compareToggle,
                  compareWithFull && styles.compareToggleActive,
                ]}
                onPress={() => setCompareWithFull((v) => !v)}
              >
                <MaterialCommunityIcons
                  name="layers-outline"
                  size={14}
                  color={compareWithFull ? '#1A73E8' : '#64748B'}
                />
                <Text
                  style={[
                    styles.compareToggleText,
                    compareWithFull && styles.compareToggleTextActive,
                  ]}
                >
                  {compareWithFull ? '8×6 ft Scale On' : 'Compare Full Sheet'}
                </Text>
              </Pressable>
            </View>

            {/* Canvas Stage */}
            <View style={styles.stageContainer}>
              {/* Width dimension callout (top) */}
              <View style={styles.dimCalloutTop}>
                <MaterialCommunityIcons
                  name="arrow-left"
                  size={12}
                  color="#64748B"
                />
                <Text style={styles.dimCalloutText}>
                  {dimFormat(widthMm)} ({showFtIn ? formatMm(widthMm) : formatInches(widthMm)})
                </Text>
                <MaterialCommunityIcons
                  name="arrow-right"
                  size={12}
                  color="#64748B"
                />
              </View>

              {/* Drawing Area */}
              <View style={styles.drawingArea}>
                {/* Height dimension callout (left) */}
                <View style={styles.dimCalloutLeft}>
                  <MaterialCommunityIcons
                    name="arrow-up"
                    size={12}
                    color="#64748B"
                  />
                  <Text style={styles.dimCalloutTextVert}>
                    {dimFormat(heightMm)}
                  </Text>
                  <MaterialCommunityIcons
                    name="arrow-down"
                    size={12}
                    color="#64748B"
                  />
                </View>

                {/* The Piece Box (with optional full sheet background) */}
                <View style={styles.pieceHost}>
                  {compareWithFull && (
                    <View
                      style={[
                        styles.fullSheetOutline,
                        { width: fullSheetW, height: fullSheetH },
                      ]}
                    >
                      <Text style={styles.fullSheetLabel}>Full Sheet 2440×1830</Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.modalPiece,
                      {
                        width: pieceW,
                        height: pieceH,
                        borderColor: themeColor,
                        backgroundColor: themeBg,
                      },
                    ]}
                  >
                    {/* Fluting visualization */}
                    {isLining && (
                      <View style={styles.modalFlutesRow}>
                        {Array.from({
                          length: Math.max(Math.floor(pieceW / 12), 3),
                        }).map((_, i) => (
                          <View
                            key={i}
                            style={[
                              styles.modalFluteStripe,
                              { backgroundColor: 'rgba(217, 119, 6, 0.22)' },
                            ]}
                          />
                        ))}
                      </View>
                    )}

                    <Text style={styles.pieceCenterBadge}>
                      {widthMm} × {heightMm}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {isLining && (
              <View style={styles.liningNoteRow}>
                <MaterialCommunityIcons
                  name="format-line-spacing"
                  size={15}
                  color="#D97706"
                />
                <Text style={styles.liningNoteText}>
                  Vertical texture fluting — cut vertically only (no rotation).
                  {verticalLineHeightMm != null
                    ? ` Line height: ${dimFormat(verticalLineHeightMm)}.`
                    : ''}
                </Text>
              </View>
            )}
          </View>

          {/* ── Key Metrics Grid ── */}
          <Text style={styles.sectionHeader}>Piece Measurements & Specs</Text>
          <View style={styles.metricsGrid}>
            {/* Area */}
            <View style={styles.metricCard}>
              <MaterialCommunityIcons
                name="chart-box-outline"
                size={20}
                color="#1A73E8"
              />
              <Text style={styles.metricValue}>{areaSqFt} sq ft</Text>
              <Text style={styles.metricSub}>{areaSqM} m² surface area</Text>
            </View>

            {/* Aspect Ratio */}
            <View style={styles.metricCard}>
              <MaterialCommunityIcons
                name="aspect-ratio"
                size={20}
                color="#7C3AED"
              />
              <Text style={styles.metricValue}>{aspectInfo.orientation}</Text>
              <Text style={styles.metricSub}>Ratio: {aspectInfo.ratioText}</Text>
            </View>

            {/* Dimensions (Dual) */}
            <View style={styles.metricCard}>
              <MaterialCommunityIcons
                name="arrow-expand"
                size={20}
                color="#059669"
              />
              <Text style={styles.metricValue}>{formatMm(widthMm)} × {formatMm(heightMm)}</Text>
              <Text style={styles.metricSub}>{formatInches(widthMm)} × {formatInches(heightMm)}</Text>
            </View>

            {/* Stock Count */}
            <View style={styles.metricCard}>
              <MaterialCommunityIcons
                name="package-variant"
                size={20}
                color="#D97706"
              />
              <Text style={styles.metricValue}>
                {quantity} in stock
              </Text>
              <Text style={styles.metricSub}>
                {isOffcut ? 'Ready for cutting jobs' : 'Standard Full Sheet'}
              </Text>
            </View>
          </View>

          {/* Close button */}
          <Pressable style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ── Thumbnail Styles ──
  thumbnailContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  thumbnailPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  thumbnailPiece: {
    borderRadius: 4,
    borderWidth: 1.5,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
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
  },
  zoomHintIcon: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: 4,
    padding: 1,
  },

  // ── Modal Styles ──
  modalRoot: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalHeaderLeft: {
    flex: 1,
    paddingHorizontal: 12,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalCategory: {
    fontSize: 13,
    color: '#64748B',
  },
  closeBtn: {
    padding: 4,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
    paddingBottom: 36,
  },

  // ── Canvas Card ──
  canvasCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    elevation: 1,
  },
  canvasHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  canvasTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  canvasTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  compareToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  compareToggleActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
  },
  compareToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  compareToggleTextActive: {
    color: '#1A73E8',
  },
  stageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  dimCalloutTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  dimCalloutText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  drawingArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimCalloutLeft: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    width: 24,
  },
  dimCalloutTextVert: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
    marginVertical: 4,
  },
  pieceHost: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    minWidth: 100,
    minHeight: 100,
  },
  fullSheetOutline: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    borderStyle: 'dashed',
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    padding: 4,
  },
  fullSheetLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '600',
  },
  modalPiece: {
    borderWidth: 2,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  modalFlutesRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'stretch',
  },
  modalFluteStripe: {
    width: 1.5,
    height: '100%',
  },
  pieceCenterBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liningNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  liningNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
  },

  // ── Metrics Grid ──
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 6,
  },
  metricSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },

  // ── Done Button ──
  doneBtn: {
    backgroundColor: '#1A73E8',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
