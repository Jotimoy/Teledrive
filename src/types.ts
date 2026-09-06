/**
 * TeleDrive - Real-time RC Car Control & Streaming Types
 */

export interface DriveCommand {
  throttle: number;      // -100 (Full Reverse) to +100 (Full Forward)
  steer: number;         // -100 (Full Left) to +100 (Full Right)
  brake: boolean;        // Emergency brake
  gear: 1 | 2 | 3;       // 1: 40% (Eco/Crawler), 2: 75% (Cruise), 3: 100% (Sport/Nitro)
  headlights: boolean;   // Toggle headlights / LEDs
  horn: boolean;         // Buzzer / Horn
  hazard: boolean;       // Blinking hazard lights
  timestamp: number;     // Milliseconds timestamp for latency tracking
}

export interface TelemetryData {
  pingMs: number;
  fps: number;
  resolution: string;
  phoneBattery: number | null;
  carBatteryVolts: number;
  roll: number;           // Lateral tilt (degrees)
  pitch: number;          // Forward/back tilt (degrees)
  heading: number;        // Compass degrees
  espConnected: boolean;
  espMode: 'ble' | 'serial' | 'wifi' | 'sim';
  speedKmh: number;
  packetsReceived: number;
  lastCommandAt: number;
  signalQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export type ConnectionRole = 'pilot' | 'car';

export type ESP32ConnectionMethod = 'ble' | 'serial' | 'wifi' | 'sim';

export interface RoomSession {
  roomId: string;
  role: ConnectionRole;
  clientId: string;
  carOnline: boolean;
  connectedPilots: number;
}

export interface ConsoleLogEntry {
  id: string;
  time: string;
  source: 'SYSTEM' | 'ESP32' | 'WEBRTC' | 'DRIVE';
  type: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface VideoFilterSettings {
  brightness: number;
  contrast: number;
  nightVision: boolean;
  thermalSim: boolean;
  mirror: boolean;
  gridHUD: boolean;
}
