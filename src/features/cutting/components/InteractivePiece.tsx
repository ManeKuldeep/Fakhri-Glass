import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, Modal } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CuttingSheet, PlacedPiece } from '../types';

interface InteractivePieceProps {
  piece: PlacedPiece;
  sheet: CuttingSheet;
  scale: number;
  originX: number;
  originY: number;
  kerfMm: number;
  allSheets: CuttingSheet[];
  otherPiecesOnSheet: PlacedPiece[];
  onUpdatePosition: (pieceId: string, x_mm: number, y_mm: number) => void;
  onRotatePiece: (pieceId: string) => void;
  onMoveToSheet: (pieceId: string, targetSheetId: string) => void;
  onRemoveToTray: (pieceId: string) => void;
}

export default function InteractivePiece({
  piece,
  sheet,
  scale,
  originX,
  originY,
  kerfMm,
  allSheets,
  otherPiecesOnSheet,
  onUpdatePosition,
  onRotatePiece,
  onMoveToSheet,
  onRemoveToTray,
}: InteractivePieceProps) {
  const [selected, setSelected] = useState(false);
  const [moveModalVisible, setMoveModalVisible] = useState(false);

  // Position offsets during dragging
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Check if lining (strictly forbids rotation)
  const isLining = (piece.is_lining ?? false) || (sheet.is_lining ?? false);

  function handleDragEnd(dx: number, dy: number) {
    const rawX_mm = Math.round(piece.x_mm + dx / scale);
    const rawY_mm = Math.round(piece.y_mm + dy / scale);

    let finalX = rawX_mm;
    let finalY = rawY_mm;

    // Snap threshold: 25 mm
    const snapThreshold = 25;

    // 1. Snap to sheet boundaries
    if (Math.abs(finalX) < snapThreshold) finalX = 0;
    if (Math.abs(finalX + piece.w_mm - sheet.width_mm) < snapThreshold) {
      finalX = sheet.width_mm - piece.w_mm;
    }
    if (Math.abs(finalY) < snapThreshold) finalY = 0;
    if (Math.abs(finalY + piece.h_mm - sheet.height_mm) < snapThreshold) {
      finalY = sheet.height_mm - piece.h_mm;
    }

    // 2. Snap to other pieces
    for (const other of otherPiecesOnSheet) {
      // Snap right of other (with kerf)
      if (Math.abs(finalX - (other.x_mm + other.w_mm + kerfMm)) < snapThreshold) {
        finalX = other.x_mm + other.w_mm + kerfMm;
      }
      // Snap left of other (with kerf)
      if (Math.abs(finalX + piece.w_mm + kerfMm - other.x_mm) < snapThreshold) {
        finalX = other.x_mm - piece.w_mm - kerfMm;
      }
      // Snap below other (with kerf)
      if (Math.abs(finalY - (other.y_mm + other.h_mm + kerfMm)) < snapThreshold) {
        finalY = other.y_mm + other.h_mm + kerfMm;
      }
      // Snap above other (with kerf)
      if (Math.abs(finalY + piece.h_mm + kerfMm - other.y_mm) < snapThreshold) {
        finalY = other.y_mm - piece.h_mm - kerfMm;
      }
      // Edge alignments
      if (Math.abs(finalX - other.x_mm) < snapThreshold) finalX = other.x_mm;
      if (Math.abs(finalY - other.y_mm) < snapThreshold) finalY = other.y_mm;
    }

    // Clamp inside sheet
    finalX = Math.max(0, Math.min(sheet.width_mm - piece.w_mm, finalX));
    finalY = Math.max(0, Math.min(sheet.height_mm - piece.h_mm, finalY));

    translateX.value = 0;
    translateY.value = 0;

    onUpdatePosition(piece.id, finalX, finalY);
  }

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      runOnJS(handleDragEnd)(event.translationX, event.translationY);
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(setSelected)(!selected);
  });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
      ],
    };
  });

  const pxX = originX + piece.x_mm * scale;
  const pxY = originY + piece.y_mm * scale;
  const pxW = Math.max(piece.w_mm * scale, 2);
  const pxH = Math.max(piece.h_mm * scale, 2);

  const hasCollision = piece.hasCollision;

  return (
    <>
      <GestureDetector gesture={Gesture.Race(panGesture, tapGesture)}>
        <Animated.View
          style={[
            styles.pieceBox,
            {
              left: pxX,
              top: pxY,
              width: pxW,
              height: pxH,
            },
            hasCollision && styles.collisionBox,
            selected && styles.selectedBox,
            animatedStyle,
          ]}
        >
          {/* Piece Content */}
          <View style={styles.innerContent}>
            <View style={styles.topRow}>
              <Text
                style={[
                  styles.orderNumber,
                  hasCollision && styles.collisionText,
                  selected && styles.selectedText,
                ]}
                numberOfLines={1}
              >
                #{piece.order_no} ({piece.piece_index}/{piece.total_qty})
              </Text>
              {hasCollision ? (
                <MaterialCommunityIcons name="alert" size={14} color="#EF4444" />
              ) : null}
            </View>

            <Text
              style={[styles.dimensionText, hasCollision && styles.collisionText]}
              numberOfLines={1}
            >
              {piece.w_mm} × {piece.h_mm}
            </Text>

            {isLining ? (
              <MaterialCommunityIcons
                name="arrow-up-down"
                size={12}
                color="#B45309"
                style={styles.grainIcon}
              />
            ) : null}
          </View>

          {/* Floating actions menu when piece is selected */}
          {selected && (
            <View style={styles.floatingMenu}>
              {/* Rotate button — STRICTLY HIDDEN IF LINING */}
              {!isLining ? (
                <Pressable
                  style={styles.menuActionBtn}
                  onPress={() => onRotatePiece(piece.id)}
                >
                  <MaterialCommunityIcons name="rotate-right" size={16} color="#FFFFFF" />
                  <Text style={styles.menuActionText}>Rotate</Text>
                </Pressable>
              ) : null}

              {/* Move to another sheet */}
              {allSheets.length > 1 ? (
                <Pressable
                  style={styles.menuActionBtn}
                  onPress={() => setMoveModalVisible(true)}
                >
                  <MaterialCommunityIcons
                    name="file-move-outline"
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={styles.menuActionText}>Move</Text>
                </Pressable>
              ) : null}

              {/* Remove to tray */}
              <Pressable
                style={[styles.menuActionBtn, styles.menuActionBtnDanger]}
                onPress={() => onRemoveToTray(piece.id)}
              >
                <MaterialCommunityIcons name="tray-arrow-down" size={16} color="#FFFFFF" />
                <Text style={styles.menuActionText}>Remove</Text>
              </Pressable>
            </View>
          )}
        </Animated.View>
      </GestureDetector>

      {/* Move Sheet Modal */}
      <Modal
        visible={moveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMoveModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setMoveModalVisible(false)}
        >
          <View style={styles.sheetPickerModal}>
            <Text style={styles.sheetPickerTitle}>Move Piece to Sheet</Text>
            <Text style={styles.sheetPickerSubtitle}>
              Select destination sheet for #{piece.order_no} ({piece.w_mm}×{piece.h_mm} mm):
            </Text>

            {allSheets
              .filter((s) => s.id !== sheet.id)
              .map((targetSheet, idx) => (
                <Pressable
                  key={targetSheet.id}
                  style={styles.sheetChoiceBtn}
                  onPress={() => {
                    setMoveModalVisible(false);
                    onMoveToSheet(piece.id, targetSheet.id);
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
    </>
  );
}

const styles = StyleSheet.create({
  pieceBox: {
    position: 'absolute',
    backgroundColor: '#DBEAFE',
    borderWidth: 1.5,
    borderColor: '#2563EB',
    borderRadius: 6,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  collisionBox: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
    borderWidth: 2,
  },
  selectedBox: {
    borderColor: '#1D4ED8',
    borderWidth: 2.5,
    backgroundColor: '#BFDBFE',
    zIndex: 999,
  },
  innerContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  orderNumber: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E40AF',
  },
  dimensionText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#1E3A8A',
    marginTop: 1,
  },
  collisionText: {
    color: '#991B1B',
  },
  selectedText: {
    color: '#1D4ED8',
  },
  grainIcon: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  floatingMenu: {
    position: 'absolute',
    top: -42,
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 4,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 1000,
  },
  menuActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: '#334155',
  },
  menuActionBtnDanger: {
    backgroundColor: '#991B1B',
  },
  menuActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
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
