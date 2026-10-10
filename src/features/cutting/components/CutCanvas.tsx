import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, Line, Rect, vec } from '@shopify/react-native-skia';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CuttingSheet, PlacedPiece } from '../types';
import InteractivePiece from './InteractivePiece';
import { ResultOffcut, WastedRect, KerfCut } from '../../../optimizer/types';
import { formatInches } from '../../inventory/utils';

interface CutCanvasProps {
  sheet: CuttingSheet;
  placedPieces: PlacedPiece[];
  allSheets: CuttingSheet[];
  offcuts: ResultOffcut[];
  wastedRects: WastedRect[];
  kerfCuts: KerfCut[];
  kerfMm: number;
  selectedPieceId?: string | null;
  onSelectPiece?: (id: string | null) => void;
  onUpdatePosition: (pieceId: string, x_mm: number, y_mm: number) => void;
  onRotatePiece: (pieceId: string) => void;
  onMoveToSheet: (pieceId: string, targetSheetId: string) => void;
  onMoveToNextSheet?: (pieceId: string) => void;
  onRemoveToTray: (pieceId: string) => void;
}

export default function CutCanvas({
  sheet,
  placedPieces,
  allSheets,
  offcuts,
  wastedRects,
  kerfCuts,
  kerfMm,
  selectedPieceId: selectedPieceIdProp,
  onSelectPiece,
  onUpdatePosition,
  onRotatePiece,
  onMoveToSheet,
  onMoveToNextSheet,
  onRemoveToTray,
}: CutCanvasProps) {
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [moveModalVisible, setMoveModalVisible] = useState(false);

  const isExternalControl = onSelectPiece !== undefined;
  const currentSelectedId = isExternalControl ? (selectedPieceIdProp ?? null) : internalSelectedId;

  // Clear piece selection whenever active sheet changes
  useEffect(() => {
    if (isExternalControl) {
      onSelectPiece(null);
    } else {
      setInternalSelectedId(null);
    }
  }, [sheet.id, isExternalControl, onSelectPiece]);

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setContainerSize({ width, height });
    }
  }

  const { width: cW, height: cH } = containerSize;
  const padding = 24;

  const { scale, originX, originY, sheetPxW, sheetPxH } = useMemo(() => {
    if (cW <= 0 || cH <= 0 || sheet.width_mm <= 0 || sheet.height_mm <= 0) {
      return { scale: 1, originX: 0, originY: 0, sheetPxW: 0, sheetPxH: 0 };
    }

    const availableW = cW - padding * 2;
    const availableH = cH - padding * 2;

    const s = Math.min(availableW / sheet.width_mm, availableH / sheet.height_mm);
    const pxW = sheet.width_mm * s;
    const pxH = sheet.height_mm * s;
    const ox = (cW - pxW) / 2;
    const oy = (cH - pxH) / 2;

    return { scale: s, originX: ox, originY: oy, sheetPxW: pxW, sheetPxH: pxH };
  }, [cW, cH, sheet.width_mm, sheet.height_mm]);

  // Generate vertical flute lines if lining glass
  const fluteLines = useMemo(() => {
    if (!sheet.is_lining || sheetPxW <= 0) return [];
    const step = 20; // 20px intervals
    const lines: number[] = [];
    for (let x = originX + step; x < originX + sheetPxW; x += step) {
      lines.push(x);
    }
    return lines;
  }, [sheet.is_lining, originX, sheetPxW]);

  const isLining = sheet.is_lining ?? false;
  const selectedPiece = placedPieces.find((p) => p.id === currentSelectedId);

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {cW > 0 && cH > 0 && (
        <>
          {/* Skia Canvas for Sheet, Texture, Offcuts, and Cut lines */}
          <Canvas style={{ width: cW, height: cH }}>
            {/* Sheet Background Glass Rectangle */}
            <Rect
              x={originX}
              y={originY}
              width={sheetPxW}
              height={sheetPxH}
              color="#F8FAFC"
            />

            {/* Figured Glass Vertical Flutes Pattern */}
            {isLining &&
              fluteLines.map((lx, i) => (
                <Line
                  key={`flute-${i}`}
                  p1={vec(lx, originY)}
                  p2={vec(lx, originY + sheetPxH)}
                  color="#E2E8F0"
                  strokeWidth={1}
                />
              ))}

            {/* Offcut Regions (greenish transparent) */}
            {offcuts.map((o, idx) => (
              <Rect
                key={`offcut-${idx}`}
                x={originX + o.x_mm * scale}
                y={originY + o.y_mm * scale}
                width={Math.max(1, o.width_mm * scale)}
                height={Math.max(1, o.height_mm * scale)}
                color="rgba(16, 185, 129, 0.16)"
              />
            ))}

            {/* Wasted Regions (reddish-gray transparent) */}
            {wastedRects.map((w, idx) => (
              <Rect
                key={`waste-${idx}`}
                x={originX + w.x_mm * scale}
                y={originY + w.y_mm * scale}
                width={Math.max(1, w.width_mm * scale)}
                height={Math.max(1, w.height_mm * scale)}
                color="rgba(239, 68, 68, 0.12)"
              />
            ))}

            {/* Kerf Cut Score Lines (amber blade loss) */}
            {kerfCuts.map((k, idx) => (
              <Rect
                key={`kerf-${idx}`}
                x={originX + k.x_mm * scale}
                y={originY + k.y_mm * scale}
                width={Math.max(1.5, k.width_mm * scale)}
                height={Math.max(1.5, k.height_mm * scale)}
                color="#F59E0B"
              />
            ))}
          </Canvas>

          {/* Border around the Sheet with mm dimension tags */}
          <View
            style={[
              styles.sheetBorder,
              {
                left: originX,
                top: originY,
                width: sheetPxW,
                height: sheetPxH,
              },
            ]}
            pointerEvents="none"
          >
            <View style={styles.sheetTopTag}>
              <Text style={styles.sheetTagText}>
                {sheet.source === 'offcut' ? 'Offcut Sheet' : 'Full Sheet'} ·{' '}
                {sheet.width_mm} × {sheet.height_mm} mm
              </Text>
            </View>
          </View>

          {/* Overlay labels for remaining offcut regions */}
          {offcuts.map((o, idx) => {
            const oX = originX + o.x_mm * scale;
            const oY = originY + o.y_mm * scale;
            const oW = o.width_mm * scale;
            const oH = o.height_mm * scale;

            if (oW < 32 || oH < 24) return null;

            return (
              <View
                key={`offcut-badge-${idx}`}
                style={[
                  styles.offcutOverlayBox,
                  {
                    left: oX,
                    top: oY,
                    width: oW,
                    height: oH,
                  },
                ]}
                pointerEvents="none"
              >
                <View style={styles.offcutPill}>
                  <Text style={styles.offcutPillTitle}>REMAINING OFFCUT</Text>
                  <Text style={styles.offcutPillDims}>
                    {o.width_mm} × {o.height_mm} mm
                  </Text>
                  <Text style={styles.offcutPillSub}>
                    ({formatInches(o.width_mm)} × {formatInches(o.height_mm)})
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Overlay labels for wasted/discard regions */}
          {wastedRects.map((w, idx) => {
            const wX = originX + w.x_mm * scale;
            const wY = originY + w.y_mm * scale;
            const wW = w.width_mm * scale;
            const wH = w.height_mm * scale;

            if (wW < 45 || wH < 28) return null;

            return (
              <View
                key={`waste-badge-${idx}`}
                style={[
                  styles.wasteOverlayBox,
                  {
                    left: wX,
                    top: wY,
                    width: wW,
                    height: wH,
                  },
                ]}
                pointerEvents="none"
              >
                <View style={styles.wastePill}>
                  <Text style={styles.wastePillTitle}>DISCARD</Text>
                  <Text style={styles.wastePillDims}>
                    {w.width_mm} × {w.height_mm} mm
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Interactive Placed Pieces on this Sheet */}
          {placedPieces.map((piece) => {
            const others = placedPieces.filter((p) => p.id !== piece.id);
            return (
              <InteractivePiece
                key={piece.id}
                piece={piece}
                sheet={sheet}
                scale={scale}
                originX={originX}
                originY={originY}
                kerfMm={kerfMm}
                otherPiecesOnSheet={others}
                isSelected={piece.id === currentSelectedId}
                onSelect={() => {
                  if (isExternalControl && onSelectPiece) {
                    onSelectPiece(currentSelectedId === piece.id ? null : piece.id);
                  } else {
                    setInternalSelectedId((curr) => (curr === piece.id ? null : piece.id));
                  }
                }}
                onUpdatePosition={onUpdatePosition}
              />
            );
          })}

          {/* Docked Action Toolbar for Selected Piece (only if not controlled externally) */}
          {!isExternalControl && selectedPiece && (
            <View style={styles.selectedPieceToolbar}>
              <View style={styles.selectedPieceHeader}>
                <View style={styles.selectedPieceBadge}>
                  <Text style={styles.selectedPieceTitle}>
                    Order #{selectedPiece.order_no} ({selectedPiece.piece_index}/
                    {selectedPiece.total_qty})
                  </Text>
                  <Text style={styles.selectedPieceSubtitle}>
                    {selectedPiece.w_mm} × {selectedPiece.h_mm} mm
                  </Text>
                </View>

                <Pressable
                  style={styles.closeToolbarBtn}
                  onPress={() => setInternalSelectedId(null)}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#94A3B8" />
                </Pressable>
              </View>

              <View style={styles.selectedPieceActions}>
                {/* Rotate button — STRICTLY HIDDEN IF LINING */}
                {!isLining && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionBtn,
                      pressed && styles.actionBtnPressed,
                    ]}
                    onPress={() => onRotatePiece(selectedPiece.id)}
                  >
                    <MaterialCommunityIcons name="rotate-right" size={16} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>Rotate</Text>
                  </Pressable>
                )}

                {/* Move/stash to next sheet directly */}
                {onMoveToNextSheet && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionBtn,
                      styles.nextSheetBtn,
                      pressed && styles.actionBtnPressed,
                    ]}
                    onPress={() => {
                      onMoveToNextSheet(selectedPiece.id);
                      setInternalSelectedId(null);
                    }}
                  >
                    <MaterialCommunityIcons
                      name="arrow-right-bold-circle-outline"
                      size={16}
                      color="#FFFFFF"
                    />
                    <Text style={styles.actionBtnText}>Next Sheet</Text>
                  </Pressable>
                )}

                {/* Move to specific sheet modal */}
                {allSheets.length > 1 && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionBtn,
                      pressed && styles.actionBtnPressed,
                    ]}
                    onPress={() => setMoveModalVisible(true)}
                  >
                    <MaterialCommunityIcons
                      name="file-move-outline"
                      size={16}
                      color="#FFFFFF"
                    />
                    <Text style={styles.actionBtnText}>Move...</Text>
                  </Pressable>
                )}

                {/* Remove to tray */}
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.removeBtn,
                    pressed && styles.actionBtnPressed,
                  ]}
                  onPress={() => {
                    onRemoveToTray(selectedPiece.id);
                    setInternalSelectedId(null);
                  }}
                >
                  <MaterialCommunityIcons
                    name="tray-arrow-down"
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={styles.actionBtnText}>Remove</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Move Sheet Modal (only if not controlled externally) */}
          {!isExternalControl && (
            <Modal
              visible={moveModalVisible && !!selectedPiece}
              transparent
              animationType="fade"
              onRequestClose={() => setMoveModalVisible(false)}
            statusBarTranslucent
          >
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setMoveModalVisible(false)}
            >
              <View style={styles.sheetPickerModal}>
                <Text style={styles.sheetPickerTitle}>Move Piece to Sheet</Text>
                {selectedPiece && (
                  <Text style={styles.sheetPickerSubtitle}>
                    Select destination sheet for #{selectedPiece.order_no} (
                    {selectedPiece.w_mm}×{selectedPiece.h_mm} mm):
                  </Text>
                )}

                {allSheets
                  .filter((s) => s.id !== sheet.id)
                  .map((targetSheet, idx) => (
                    <Pressable
                      key={targetSheet.id}
                      style={styles.sheetChoiceBtn}
                      onPress={() => {
                        setMoveModalVisible(false);
                        if (selectedPiece) {
                          onMoveToSheet(selectedPiece.id, targetSheet.id);
                          setInternalSelectedId(null);
                        }
                      }}
                    >
                      <MaterialCommunityIcons
                        name={targetSheet.source === 'offcut' ? 'shape' : 'crop-square'}
                        size={20}
                        color="#1A73E8"
                      />
                      <View style={styles.sheetChoiceInfo}>
                        <Text style={styles.sheetChoiceTitle}>Sheet {idx + 1}</Text>
                        <Text style={styles.sheetChoiceMeta}>
                          {targetSheet.source === 'offcut' ? 'Offcut' : 'Full'} ·{' '}
                          {targetSheet.width_mm}×{targetSheet.height_mm} mm
                        </Text>
                      </View>
                    </Pressable>
                  ))}

                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => setMoveModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </Pressable>
          </Modal>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A', // Dark slate workshop background makes glass sheets pop!
    position: 'relative',
    overflow: 'hidden',
  },
  sheetBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#94A3B8',
    borderRadius: 8,
  },
  sheetTopTag: {
    position: 'absolute',
    top: -24,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sheetTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  offcutOverlayBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#10B981',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 3,
  },
  offcutPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.94)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  offcutPillTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: 0.4,
  },
  offcutPillDims: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 1,
  },
  offcutPillSub: {
    fontSize: 9,
    fontWeight: '600',
    color: '#D1FAE5',
  },
  wasteOverlayBox: {
    position: 'absolute',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#EF4444',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  wastePill: {
    backgroundColor: 'rgba(239, 68, 68, 0.88)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignItems: 'center',
  },
  wastePillTitle: {
    fontSize: 8,
    fontWeight: '700',
    color: '#7F1D1D',
  },
  wastePillDims: {
    fontSize: 9,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Floating Action Toolbar for selected piece
  selectedPieceToolbar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 1000,
  },
  selectedPieceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 6,
  },
  selectedPieceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedPieceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#60A5FA',
  },
  selectedPieceSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  closeToolbarBtn: {
    padding: 4,
  },
  selectedPieceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'space-between',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  actionBtnPressed: {
    opacity: 0.75,
  },
  nextSheetBtn: {
    backgroundColor: '#2563EB',
  },
  removeBtn: {
    backgroundColor: '#DC2626',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheetPickerModal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  sheetPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  sheetPickerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 14,
  },
  sheetChoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  sheetChoiceInfo: {
    flex: 1,
  },
  sheetChoiceTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  sheetChoiceMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
});
