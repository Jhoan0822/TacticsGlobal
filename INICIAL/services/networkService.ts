
// NetworkService has been removed/reverted.
export const NetworkService = {
  // Dummy exports to prevent import errors if ref exists elsewhere temporarily
  connectToRoom: async () => false,
  createRoom: async () => '',
  sendStateUpdate: () => {},
  sendAction: () => {},
  onGameStateUpdate: () => {},
  disconnect: () => {}
};
