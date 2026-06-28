export function createEventBus() {
  const listeners = new Map();

  return {
    on(eventName, handler) {
      const eventHandlers = listeners.get(eventName) || new Set();
      eventHandlers.add(handler);
      listeners.set(eventName, eventHandlers);
      return () => eventHandlers.delete(handler);
    },
    emit(eventName, payload) {
      const eventHandlers = listeners.get(eventName);
      if (!eventHandlers) return;
      eventHandlers.forEach((handler) => handler(payload));
    }
  };
}
