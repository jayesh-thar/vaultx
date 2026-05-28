type ToastType = 'success' | 'error' | 'info';
let _fn: ((msg: string, type: ToastType) => void) | null = null;

export function registerToastFn(fn: typeof _fn) {
  _fn = fn;
}
export function unregisterToastFn() {
  _fn = null;
}
export function toast(message: string, type: ToastType = 'success') {
  _fn?.(message, type);
}
