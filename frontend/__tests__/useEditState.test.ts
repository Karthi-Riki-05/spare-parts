import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEditState } from '../hooks/useEditState';

describe('useEditState', () => {
  test('getKey returns rowIndex_col format', () => {
    const { result } = renderHook(() => useEditState());
    expect(result.current.getKey(5, 'manufacturer')).toBe('5_manufacturer');
  });

  test('startEdit + isEditing returns true', () => {
    const { result } = renderHook(() => useEditState());
    act(() => {
      result.current.startEdit(0, 'description', 'Motor');
    });
    expect(result.current.isEditing(0, 'description')).toBe(true);
  });

  test('commitEdit stores value and stops editing', () => {
    const { result } = renderHook(() => useEditState());
    act(() => {
      result.current.startEdit(0, 'description', 'Motor');
    });
    act(() => {
      result.current.commitEdit(0, 'description', 'AC Motor');
    });
    expect(result.current.isEditing(0, 'description')).toBe(false);
    expect(result.current.getEditedValue(0, 'description')).toBe('AC Motor');
  });

  test('cancelEdit stops editing without changing stored value', () => {
    const { result } = renderHook(() => useEditState());
    act(() => {
      result.current.startEdit(0, 'description', 'Motor');
    });
    act(() => {
      result.current.cancelEdit(0, 'description');
    });
    expect(result.current.isEditing(0, 'description')).toBe(false);
    // cancelEdit deletes the key from the map
    expect(result.current.getEditedValue(0, 'description')).toBeUndefined();
  });

  test('multiple simultaneous edits tracked separately', () => {
    const { result } = renderHook(() => useEditState());
    act(() => {
      result.current.startEdit(0, 'description', 'Motor');
    });
    act(() => {
      result.current.commitEdit(0, 'description', 'AC Motor');
    });
    act(() => {
      result.current.startEdit(1, 'manufacturer', 'ABB');
    });
    // Row 0 description should retain its committed value
    expect(result.current.getEditedValue(0, 'description')).toBe('AC Motor');
    // Row 1 manufacturer should be in edit mode
    expect(result.current.isEditing(1, 'manufacturer')).toBe(true);
  });

  test('isEditing returns false for non-active cell', () => {
    const { result } = renderHook(() => useEditState());
    expect(result.current.isEditing(99, 'itemNumber')).toBe(false);
  });
});
