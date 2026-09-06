/**
 * WebRTC and WebSocket real-time networking engine
 * Handles low-latency video streaming, ICE candidates, and DataChannels.
 */

export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export function getWebSocketUrl(): string {
  const loc = window.location;
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${loc.host}/ws`;
}

export function formatLatency(ms: number): string {
  if (ms <= 0) return '-- ms';
  return `${Math.round(ms)} ms`;
}
