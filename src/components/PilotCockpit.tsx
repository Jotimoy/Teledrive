import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Wifi,
  WifiOff,
  Video,
  Camera,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Lightbulb,
  Maximize2,
  Minimize2,
  Sliders,
  ShieldAlert,
  Battery,
  Zap,
  Gauge,
  Compass,
  Radio,
  Gamepad2,
  Eye,
  Download,
  Flame,
  HelpCircle,
  Play,
  RotateCcw,
  AlertTriangle,
  X,
  ShieldCheck
} from 'lucide-react';
import { DriveCommand, TelemetryData, VideoFilterSettings } from '../types';
import { ICE_SERVERS, getWebSocketUrl, formatLatency } from '../utils/webrtc';
import { soundEngine } from '../utils/audio';
import { VirtualCarSimulator } from './VirtualCarSimulator';

interface PilotCockpitProps {
  roomId: string;
  onBackToMenu: () => void;
  onOpenGuide: () => void;
}

export const PilotCockpit: React.FC<PilotCockpitProps> = ({
  roomId,
  onBackToMenu,
  onOpenGuide
}) => {
  // Connection states
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [carOnline, setCarOnline] = useState(false);
  const [webrtcState, setWebrtcState] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [pingMs, setPingMs] = useState<number>(0);
  const [fps, setFps] = useState<number>(30);
  const [useVirtualSimulator, setUseVirtualSimulator] = useState(false);

  // Drive Command State
  const [command, setCommand] = useState<DriveCommand>({
    throttle: 0,
    steer: 0,
    brake: false,
    gear: 2, // Cruise 75%
    headlights: false,
    horn: false,
    hazard: false,
    timestamp: Date.now()
  });

  // Telemetry from Car
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    pingMs: 0,
    fps: 30,
    resolution: '720p',
    phoneBattery: 85,
    carBatteryVolts: 8.2,
    roll: 0,
    pitch: 0,
    heading: 0,
    espConnected: true,
    espMode: 'ble',
    speedKmh: 0,
    packetsReceived: 0,
    lastCommandAt: 0,
    signalQuality: 'good'
  });

  // Cockpit Settings & Filters
  const [filters, setFilters] = useState<VideoFilterSettings>({
    brightness: 100,
    contrast: 100,
    nightVision: false,
    thermalSim: false,
    mirror: false,
    gridHUD: true
  });

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isTalkbackActive, setIsTalkbackActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [gamepadName, setGamepadName] = useState<string>('');
  const [showControlsHelp, setShowControlsHelp] = useState(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const [cruiseControl, setCruiseControl] = useState(false);
  const cruiseControlRef = useRef(false);
  cruiseControlRef.current = cruiseControl;

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Command History Logs
  const [commandLogs, setCommandLogs] = useState<string[]>([
    `[${new Date().toTimeString().slice(0, 8)}] INITIALIZING PILOT COCKPIT`,
    `[${new Date().toTimeString().slice(0, 8)}] ROOM: ${roomId} SESSION_KEY_READY`,
    `[${new Date().toTimeString().slice(0, 8)}] WEBRTC ENGINE INITIALIZED`,
    `[${new Date().toTimeString().slice(0, 8)}] WAITING_FOR_CAR_STREAM...`
  ]);

  const addLog = useCallback((text: string) => {
    const time = new Date().toTimeString().slice(0, 8);
    setCommandLogs((prev) => [...prev.slice(-6), `[${time}] ${text}`]);
  }, []);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cockpitContainerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pingIntervalRef = useRef<any>(null);
  const wsReconnectTimerRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);
  const activeKeysRef = useRef<{ [key: string]: boolean }>({});
  const lastHeartbeatTimeRef = useRef<number>(0);
  const commandRef = useRef<DriveCommand>(command);
  commandRef.current = command;

  // Sound Engine Setup
  useEffect(() => {
    soundEngine.setMuted(isAudioMuted);
  }, [isAudioMuted]);

  // Dispatch driving command via DataChannel or WebSocket
  const dispatchCommand = useCallback((newCmd: Partial<DriveCommand>) => {
    setCommand((prev) => {
      const updated: DriveCommand = {
        ...prev,
        ...newCmd,
        timestamp: Date.now()
      };

      // Sound update
      soundEngine.updateThrottle(updated.brake ? 0 : updated.throttle);
      if (newCmd.horn !== undefined) {
        soundEngine.playHorn(newCmd.horn);
      }
      if (newCmd.brake && !prev.brake) {
        soundEngine.playBrakeChirp();
      }

      // 1. Send via WebRTC DataChannel (lowest possible latency UDP-style)
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        try {
          dataChannelRef.current.send(JSON.stringify(updated));
        } catch {}
      }

      // 2. Also send via WebSocket relay as backup
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'drive-cmd',
          cmd: updated
        }));
      }

      return updated;
    });
  }, []);

  // Keyboard Event Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid hotkeys when typing in input
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      const key = e.key.toLowerCase();
      activeKeysRef.current[key] = true;

      // Single action toggles
      if (key === 'l' && !e.repeat) {
        dispatchCommand({ headlights: !commandRef.current.headlights });
      }
      if (key === 'h' && !e.repeat) {
        dispatchCommand({ horn: true });
      }
      if (key === 'c' && !e.repeat) {
        setCruiseControl((prev) => {
          const next = !prev;
          addLog(next ? 'CRUISE_CONTROL_ENGAGED [C]' : 'CRUISE_CONTROL_OFF');
          return next;
        });
      }
      if (key === '1') dispatchCommand({ gear: 1 });
      if (key === '2') dispatchCommand({ gear: 2 });
      if (key === '3') dispatchCommand({ gear: 3 });
      if (key === ' ') {
        e.preventDefault();
        setCruiseControl(false);
        dispatchCommand({ brake: true });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      activeKeysRef.current[key] = false;

      if (key === 'h') {
        dispatchCommand({ horn: false });
      }
      if (key === ' ') {
        dispatchCommand({ brake: false });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [dispatchCommand, addLog]);

  // Main 30Hz Controller Polling Loop (Keyboard + Gamepad)
  useEffect(() => {
    soundEngine.startEngine();

    const interval = setInterval(() => {
      const keys = activeKeysRef.current;
      let throttle = 0;
      let steer = 0;
      let isBraking = keys[' '] || false;

      // Keyboard WASD / Arrows
      if (keys['w'] || keys['arrowup']) throttle += 100;
      if (keys['s'] || keys['arrowdown']) {
        throttle -= 100;
        if (cruiseControlRef.current) {
          setCruiseControl(false);
          addLog('CRUISE_DISENGAGED (REVERSE)');
        }
      }
      if (keys['a'] || keys['arrowleft']) steer -= 100;
      if (keys['d'] || keys['arrowright']) steer += 100;

      // Turbo shift
      if (keys['shift'] && throttle > 0) {
        throttle = 100;
      }

      // Cruise Lock: keep forward moving if active
      if (cruiseControlRef.current && throttle === 0 && !isBraking) {
        throttle = 100;
      }
      if (isBraking && cruiseControlRef.current) {
        setCruiseControl(false);
        addLog('CRUISE_DISENGAGED (BRAKE)');
      }

      // Check Gamepad
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads[0];
      if (gp && gp.connected) {
        setGamepadConnected(true);
        setGamepadName(gp.id);

        // Axis 0: Left Stick Horizontal (Steering)
        const deadzone = 0.12;
        const stickSteer = Math.abs(gp.axes[0]) > deadzone ? gp.axes[0] : 0;
        if (Math.abs(stickSteer) > 0) {
          steer = Math.round(stickSteer * 100);
        }

        // Triggers or Right Stick for Throttle
        // Button 7: RT (Throttle), Button 6: LT (Brake/Reverse)
        const rt = gp.buttons[7]?.value || 0;
        const lt = gp.buttons[6]?.value || 0;
        if (rt > 0.05) {
          throttle = Math.round(rt * 100);
        } else if (lt > 0.05) {
          throttle = -Math.round(lt * 100);
        }

        // Button 0 (A / Cross) -> Horn
        if (gp.buttons[0]?.pressed && !commandRef.current.horn) {
          dispatchCommand({ horn: true });
        } else if (!gp.buttons[0]?.pressed && commandRef.current.horn) {
          dispatchCommand({ horn: false });
        }

        // Button 1 (B / Circle) -> Brake
        if (gp.buttons[1]?.pressed) {
          isBraking = true;
          if (cruiseControlRef.current) setCruiseControl(false);
        }

        // Button 3 (Y / Triangle) -> Headlights
        if (gp.buttons[3]?.pressed) {
          dispatchCommand({ headlights: !commandRef.current.headlights });
        }
      } else {
        setGamepadConnected(false);
      }

      // Calculate geared throttle
      const currentGear = commandRef.current.gear;
      const gearLimit = currentGear === 1 ? 40 : currentGear === 2 ? 75 : 100;
      const clampedThrottle = Math.round((throttle * gearLimit) / 100);

      const stateChanged =
        clampedThrottle !== commandRef.current.throttle ||
        steer !== commandRef.current.steer ||
        isBraking !== commandRef.current.brake;

      const now = Date.now();
      const isDriving = clampedThrottle !== 0 || steer !== 0 || isBraking;

      // CONTINUOUS HEARTBEAT STREAM:
      // When driving (holding W / steering / braking), send commands continuously at ~16Hz (every 60ms).
      // This prevents the ESP32 failsafe watchdog from cutting off motors while user is holding forward!
      // When idle, send a keepalive every 350ms.
      const shouldStream = isDriving
        ? now - lastHeartbeatTimeRef.current >= 60
        : now - lastHeartbeatTimeRef.current >= 350;

      if (stateChanged || shouldStream) {
        lastHeartbeatTimeRef.current = now;
        dispatchCommand({
          throttle: clampedThrottle,
          steer,
          brake: isBraking
        });
      }
    }, 33); // ~30 times per second

    return () => clearInterval(interval);
  }, [dispatchCommand, addLog]);

  // WebRTC Setup for Pilot (Receiver)
  const initWebRTC = useCallback(() => {
    if (peerConnRef.current) {
      try {
        peerConnRef.current.close();
      } catch {}
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnRef.current = pc;
    setWebrtcState('connecting');

    // Create low-latency DataChannel (UDP semantics)
    try {
      const dc = pc.createDataChannel('drive-data', {
        ordered: false,
        maxRetransmits: 0
      });
      dataChannelRef.current = dc;
    } catch {}

    // When remote track arrives from car phone
    pc.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        setWebrtcState('connected');
        setCarOnline(true);
      }
    };

    // When remote DataChannel arrives from Car Phone
    pc.ondatachannel = (event) => {
      const dc = event.channel;
      dataChannelRef.current = dc;
      dc.onopen = () => {
        addLog('P2P_DATACHANNEL_ESTABLISHED_FAST');
      };
      dc.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'telemetry') {
            setTelemetry((prev) => ({ ...prev, ...msg.data }));
          }
        } catch {}
      };
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'signal',
          data: { candidate: event.candidate }
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setWebrtcState('connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setWebrtcState('failed');
      }
    };
  }, [addLog]);

  // WebSocket Signaling Connection with Persistent Auto-Reconnection
  const connectWs = useCallback(() => {
    if (!isMountedRef.current) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = getWebSocketUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      ws.send(JSON.stringify({
        type: 'join',
        role: 'pilot',
        roomId
      }));

      // Periodic ping for RTT latency calculation
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'ping',
            timestamp: Date.now()
          }));
        }
      }, 1000);
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'joined') {
          setCarOnline(msg.carOnline);
          if (msg.carOnline) {
            initWebRTC();
          }
        }

        if (msg.type === 'peer-status') {
          if (msg.role === 'car') {
            if (msg.status === 'online') {
              setCarOnline(true);
              initWebRTC();
              addLog('CAR_STREAM_ONLINE_RESUMED');
            } else {
              setCarOnline(false);
              setWebrtcState('idle');
              addLog('CAR_STREAM_OFFLINE_DROPPED');
            }
          }
        }

        if (msg.type === 'signal') {
          const pc = peerConnRef.current;
          if (!pc) return;

          if (msg.data?.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.data.sdp));
            if (msg.data.sdp.type === 'offer') {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              ws.send(JSON.stringify({
                type: 'signal',
                data: { sdp: pc.localDescription }
              }));
            }
          } else if (msg.data?.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.data.candidate));
          }
        }

        if (msg.type === 'telemetry') {
          setTelemetry((prev) => ({
            ...prev,
            ...msg.data
          }));
        }

        if (msg.type === 'pong') {
          const rtt = Date.now() - msg.clientTimestamp;
          setPingMs(rtt);
        }
      } catch (err) {
        console.error('Pilot WS error:', err);
      }
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
      if (isMountedRef.current) {
        clearTimeout(wsReconnectTimerRef.current);
        wsReconnectTimerRef.current = setTimeout(() => {
          connectWs();
        }, 2000);
      }
    };
  }, [roomId, initWebRTC, addLog]);

  useEffect(() => {
    isMountedRef.current = true;
    connectWs();

    return () => {
      isMountedRef.current = false;
      clearTimeout(wsReconnectTimerRef.current);
      clearInterval(pingIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
      if (peerConnRef.current) peerConnRef.current.close();
      soundEngine.stopAll();
    };
  }, [connectWs]);

  // Manual Force Reconnect function to re-ping car gateway
  const forceReconnectCar = useCallback(() => {
    addLog('REQUESTING_STREAM_RENEGOTIATION');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'query-car-status',
        roomId
      }));
    } else {
      connectWs();
    }
  }, [roomId, addLog, connectWs]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!cockpitContainerRef.current) return;
    if (!document.fullscreenElement) {
      cockpitContainerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Screen Snapshot
  const captureSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const link = document.createElement('a');
    link.download = `TeleDrive_Car_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Video recording
  const toggleRecording = () => {
    if (isRecording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      if (!videoRef.current || !videoRef.current.srcObject) return;
      try {
        const stream = videoRef.current.srcObject as MediaStream;
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
        recordedChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `TeleDrive_Drive_${Date.now()}.webm`;
          a.click();
          URL.revokeObjectURL(url);
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      } catch (err) {
        console.error('Recording failed:', err);
      }
    }
  };

  return (
    <div
      ref={cockpitContainerRef}
      className="h-full w-full bg-[#050608] text-[#e0e0e0] flex flex-col overflow-hidden select-none font-sans"
    >
      {/* 1. TOP HEADER (Immersive Command Center) */}
      <header className="h-16 border-b border-[#1a1c24] flex items-center justify-between px-4 sm:px-6 bg-[#0a0c12] shrink-0 z-30">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={onBackToMenu}
            className="px-2.5 py-1.5 bg-[#1a1c24] hover:bg-[#252834] text-gray-300 border border-white/10 rounded text-xs font-bold font-mono transition-colors"
          >
            ← EXIT
          </button>
          <div className="w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_10px_#22d3ee] animate-pulse"></div>
          <h1 className="text-sm sm:text-lg font-bold tracking-widest uppercase text-cyan-50 truncate">
            ESP32-ROVER COMMAND CENTER
          </h1>
          <span className="hidden sm:inline-block font-mono text-[11px] text-cyan-400 bg-[#050608] px-2.5 py-0.5 rounded border border-cyan-500/30 uppercase font-bold">
            ROOM: {roomId}
          </span>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 text-xs font-mono">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-gray-500 text-[9px] uppercase tracking-wider">SIGNAL STRENGTH</span>
            <span className="text-cyan-400 font-bold">{carOnline ? '-42 dBm (EXCELLENT)' : '-89 dBm (WAITING)'}</span>
          </div>
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-gray-500 text-[9px] uppercase tracking-wider">LATENCY</span>
            <span className={`font-bold ${pingMs < 80 ? 'text-emerald-400' : pingMs < 150 ? 'text-amber-400' : 'text-rose-400'}`}>
              {formatLatency(pingMs)}
            </span>
          </div>
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-gray-500 text-[9px] uppercase tracking-wider">ESP32 LINK</span>
            <span className={`font-bold ${telemetry.espConnected ? 'text-cyan-400' : 'text-gray-400'}`}>
              {telemetry.espConnected ? 'ONLINE (BLE/OTG)' : 'UNLINKED'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Force Reconnect */}
            <button
              onClick={forceReconnectCar}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1a1c24] hover:bg-cyan-950/40 text-cyan-400 border border-cyan-500/30 rounded text-xs font-mono font-bold transition-colors"
              title="Ping Car Gateway & Re-establish WebRTC stream"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">RECONNECT</span>
            </button>

            {/* Troubleshoot Disconnect Guide */}
            <button
              onClick={() => setShowTroubleshoot(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-xs font-mono font-bold transition-colors"
              title="Fix Disconnection & Motor Stop Issues"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden xl:inline">FIX STOPS</span>
            </button>

            {/* Simulator Toggle */}
            <button
              onClick={() => {
                setUseVirtualSimulator(!useVirtualSimulator);
                addLog(`SIMULATOR_MODE_${!useVirtualSimulator ? 'ACTIVE' : 'OFF'}`);
              }}
              className={`px-2.5 py-1.5 rounded text-xs font-mono font-bold border transition-colors ${
                useVirtualSimulator
                  ? 'bg-cyan-600/30 border-cyan-400 text-cyan-300'
                  : 'bg-[#1a1c24] border-white/10 text-gray-300 hover:bg-[#252834]'
              }`}
              title="Toggle Virtual Simulator"
            >
              {useVirtualSimulator ? 'SIM: ON' : 'SIM: OFF'}
            </button>

            {/* Guide Button */}
            <button
              onClick={onOpenGuide}
              className="p-1.5 bg-[#1a1c24] hover:bg-[#252834] text-cyan-400 border border-cyan-500/30 rounded transition-colors"
              title="Arduino Guide"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Audio Toggle */}
            <button
              onClick={() => setIsAudioMuted(!isAudioMuted)}
              className="p-1.5 bg-[#1a1c24] hover:bg-[#252834] text-gray-300 border border-white/10 rounded transition-colors"
              title={isAudioMuted ? 'Unmute' : 'Mute'}
            >
              {isAudioMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 bg-[#1a1c24] hover:bg-[#252834] text-gray-300 border border-white/10 rounded transition-colors"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* 2. MAIN COCKPIT VIEW & TELEMETRY ASIDE */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 relative min-h-0 overflow-hidden">
        {/* Left/Center Viewport */}
        <div className="flex-1 relative rounded-xl border border-[#1a1c24] bg-black overflow-hidden shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] flex flex-col justify-between">
          {/* Tactical Crosshair Radar Reticle Overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none z-10">
            <div className="w-[600px] h-[400px] border border-cyan-900/30 rounded-full absolute"></div>
            <div className="w-[400px] h-[250px] border border-cyan-900/20 rounded-full absolute"></div>
            <div className="w-px h-full bg-cyan-900/20 absolute"></div>
            <div className="h-px w-full bg-cyan-900/20 absolute"></div>
          </div>

          {/* Real WebRTC Video Stream */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover transition-all ${
              filters.mirror ? 'scale-x-[-1]' : ''
            }`}
            style={{
              filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) ${
                filters.nightVision ? 'sepia(100%) hue-rotate(85deg) saturate(300%)' : ''
              } ${filters.thermalSim ? 'invert(100%) hue-rotate(180deg) saturate(200%)' : ''}`
            }}
          />

          {/* Virtual Simulator fallback or overlay */}
          {(!carOnline && webrtcState !== 'connected') || useVirtualSimulator ? (
            <div className="absolute inset-0 bg-[#050608]/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 z-15 overflow-y-auto">
              <div className="w-full max-w-2xl space-y-3">
                <VirtualCarSimulator
                  currentCommand={command}
                  onTelemetryUpdate={(data) => {
                    setTelemetry((prev) => ({
                      ...prev,
                      speedKmh: data.speedKmh,
                      roll: data.roll,
                      pitch: data.pitch,
                      heading: data.heading
                    }));
                  }}
                />
                {!carOnline && !useVirtualSimulator && (
                  <div className="p-4 bg-[#0a0c12] border border-[#1a1c24] rounded-xl text-center space-y-3 shadow-xl">
                    <div className="flex items-center justify-center gap-2 text-cyan-400 font-mono font-bold text-xs uppercase">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                      <span>PHYSICAL CAR PHONE STANDBY / DISCONNECTED (ROOM: {roomId})</span>
                    </div>
                    <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
                      If your car disconnected while driving, tap below to re-ping the car, or inspect the hardware brownout fix.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        onClick={forceReconnectCar}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-black font-bold font-mono text-xs rounded-lg transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                      >
                        <RotateCcw className="w-4 h-4" />
                        FORCE RECONNECT CAR FEED
                      </button>
                      <button
                        onClick={() => setShowTroubleshoot(true)}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1a1c24] hover:bg-[#252834] text-amber-300 font-bold font-mono text-xs rounded-lg border border-amber-500/40 transition-colors"
                      >
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        WHY DOES IT STOP? (FIX)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Top-Left Live Video Feed Badge */}
          <div className="absolute top-4 left-4 p-3.5 rounded-lg bg-black/50 backdrop-blur-md border border-white/10 z-20">
            <div className="text-[10px] uppercase text-gray-400 mb-0.5 font-bold tracking-wider font-mono">
              Live Video Feed
            </div>
            <div className="text-base sm:text-lg font-mono text-white font-bold tracking-wide">
              {carOnline ? `720P / ${fps}FPS` : 'STANDBY / 60FPS'}
            </div>
          </div>

          {/* Top-Right Battery Badge */}
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
            <div className="p-3 rounded-lg bg-black/50 backdrop-blur-md border border-white/10 flex items-center gap-3">
              <div className="w-2 h-8 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]"></div>
              <div>
                <div className="text-[10px] text-gray-400 uppercase font-bold font-mono">Battery</div>
                <div className="text-sm font-bold font-mono text-white">
                  {telemetry.phoneBattery}% ({telemetry.carBatteryVolts.toFixed(1)}V)
                </div>
              </div>
            </div>
          </div>

          {/* Center HUD: Cruise Status & Horizon Pitch & Roll Gyro Reticle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 flex flex-col items-center">
            {cruiseControl && (
              <div className="mb-4 px-3.5 py-1.5 bg-amber-500/20 border border-amber-400/80 rounded-full text-amber-300 text-xs font-mono font-bold tracking-wider animate-pulse flex items-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                <span>CRUISE LOCK ACTIVE ({command.gear === 1 ? '40%' : command.gear === 2 ? '75%' : '100%'})</span>
                <span className="text-[10px] text-amber-200/70 font-normal">Press [C], [S] or [Space] to cancel</span>
              </div>
            )}

            <div className="relative w-36 h-36 flex items-center justify-center">
              {/* Pitch and Roll Gyro Horizon Line */}
              <div
                className="absolute w-28 h-0.5 bg-cyan-400 shadow-[0_0_8px_#22d3ee] transition-transform duration-75"
                style={{
                  transform: `rotate(${-telemetry.roll}deg) translateY(${telemetry.pitch * 1.5}px)`
                }}
              >
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full border border-cyan-400"></div>
              </div>

              {/* Center Crosshair Ring */}
              <div className="w-16 h-16 rounded-full border border-dashed border-cyan-500/40 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]"></div>
              </div>

              {/* Angle labels */}
              <div className="absolute -bottom-3 text-[10px] font-mono text-cyan-400/90 bg-black/70 px-2 py-0.5 rounded border border-cyan-900/40">
                R: {telemetry.roll}° | P: {telemetry.pitch}°
              </div>
            </div>
          </div>

          {/* Bottom HUD Overlay: L-STICK, Tactile Navigation Keypad, R-STICK */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-4xl flex justify-between items-end pointer-events-none z-20">
            {/* L-STICK Indicator */}
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-cyan-500/30 bg-cyan-500/5 flex items-center justify-center relative backdrop-blur-sm pointer-events-auto">
              <div
                className="w-11 h-11 sm:w-12 sm:h-12 bg-cyan-500/20 rounded-full border border-cyan-400 flex items-center justify-center transition-transform duration-75 shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                style={{
                  transform: `translateY(${-command.throttle * 0.3}px)`
                }}
              >
                <span className="text-[9px] font-mono text-cyan-300 font-bold">
                  {command.throttle}%
                </span>
              </div>
              <span className="absolute -top-5 text-[10px] text-cyan-400 font-bold font-mono tracking-wider">
                L-STICK
              </span>
            </div>

            {/* Tactile Navigation Controls (W, A, S, D) Keypad */}
            <div className="flex flex-col items-center gap-2 sm:gap-2.5 bg-black/80 backdrop-blur-md p-3 sm:p-4 rounded-xl border border-white/10 pointer-events-auto shadow-2xl">
              <div className="flex items-center gap-2">
                <button
                  onMouseDown={() => {
                    activeKeysRef.current['w'] = true;
                    addLog('FORWARD_HOLD_START');
                  }}
                  onMouseUp={() => {
                    activeKeysRef.current['w'] = false;
                  }}
                  onMouseLeave={() => {
                    activeKeysRef.current['w'] = false;
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    activeKeysRef.current['w'] = true;
                    addLog('FORWARD_HOLD_START');
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    activeKeysRef.current['w'] = false;
                  }}
                  onTouchCancel={(e) => {
                    e.preventDefault();
                    activeKeysRef.current['w'] = false;
                  }}
                  className={`w-11 h-11 sm:w-12 sm:h-12 bg-[#1a1c24] border ${
                    activeKeysRef.current['w'] || activeKeysRef.current['arrowup'] || command.throttle > 0
                      ? 'border-cyan-400 bg-cyan-950/80 text-cyan-300 shadow-[0_0_15px_#22d3ee]'
                      : 'border-cyan-500/50 text-white hover:border-cyan-400'
                  } rounded flex items-center justify-center text-lg sm:text-xl font-bold cursor-pointer transition-all active:scale-95`}
                >
                  W
                </button>

                {/* Cruise Lock Toggle Button */}
                <button
                  onClick={() => {
                    setCruiseControl((prev) => {
                      const next = !prev;
                      addLog(next ? 'CRUISE_ENGAGED' : 'CRUISE_DISENGAGED');
                      return next;
                    });
                  }}
                  className={`h-11 sm:h-12 px-2.5 rounded text-[10px] font-mono font-bold border transition-all flex flex-col items-center justify-center ${
                    cruiseControl
                      ? 'bg-amber-500/30 border-amber-400 text-amber-300 shadow-[0_0_12px_#f59e0b]'
                      : 'bg-[#1a1c24] border-white/10 text-gray-400 hover:text-white'
                  }`}
                  title="Toggle Cruise Lock (Continuous Forward Driving) - Press [C]"
                >
                  <span>CRUISE</span>
                  <span className="text-[8px] font-normal">{cruiseControl ? 'ACTIVE' : '[C]'}</span>
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onMouseDown={() => {
                    activeKeysRef.current['a'] = true;
                    addLog('STEER_LEFT_START');
                  }}
                  onMouseUp={() => {
                    activeKeysRef.current['a'] = false;
                  }}
                  onMouseLeave={() => {
                    activeKeysRef.current['a'] = false;
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    activeKeysRef.current['a'] = true;
                    addLog('STEER_LEFT_START');
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    activeKeysRef.current['a'] = false;
                  }}
                  onTouchCancel={(e) => {
                    e.preventDefault();
                    activeKeysRef.current['a'] = false;
                  }}
                  className={`w-11 h-11 sm:w-12 sm:h-12 bg-[#1a1c24] border ${
                    activeKeysRef.current['a'] || activeKeysRef.current['arrowleft'] || command.steer < 0
                      ? 'border-cyan-400 bg-cyan-950/80 text-cyan-300 shadow-[0_0_15px_#22d3ee]'
                      : 'border-white/10 text-white hover:border-cyan-500/50'
                  } rounded flex items-center justify-center text-lg sm:text-xl font-bold cursor-pointer transition-all active:scale-95`}
                >
                  A
                </button>

                <button
                  onMouseDown={() => {
                    activeKeysRef.current['s'] = true;
                    addLog('REVERSE_START');
                  }}
                  onMouseUp={() => {
                    activeKeysRef.current['s'] = false;
                  }}
                  onMouseLeave={() => {
                    activeKeysRef.current['s'] = false;
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    activeKeysRef.current['s'] = true;
                    addLog('REVERSE_START');
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    activeKeysRef.current['s'] = false;
                  }}
                  onTouchCancel={(e) => {
                    e.preventDefault();
                    activeKeysRef.current['s'] = false;
                  }}
                  className={`w-11 h-11 sm:w-12 sm:h-12 bg-[#1a1c24] border ${
                    activeKeysRef.current['s'] || activeKeysRef.current['arrowdown'] || command.throttle < 0
                      ? 'border-cyan-400 bg-cyan-950/80 text-cyan-300 shadow-[0_0_15px_#22d3ee]'
                      : 'border-white/10 text-white hover:border-cyan-500/50'
                  } rounded flex items-center justify-center text-lg sm:text-xl font-bold cursor-pointer transition-all active:scale-95`}
                >
                  S
                </button>

                <button
                  onMouseDown={() => {
                    activeKeysRef.current['d'] = true;
                    addLog('STEER_RIGHT_START');
                  }}
                  onMouseUp={() => {
                    activeKeysRef.current['d'] = false;
                  }}
                  onMouseLeave={() => {
                    activeKeysRef.current['d'] = false;
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    activeKeysRef.current['d'] = true;
                    addLog('STEER_RIGHT_START');
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    activeKeysRef.current['d'] = false;
                  }}
                  onTouchCancel={(e) => {
                    e.preventDefault();
                    activeKeysRef.current['d'] = false;
                  }}
                  className={`w-11 h-11 sm:w-12 sm:h-12 bg-[#1a1c24] border ${
                    activeKeysRef.current['d'] || activeKeysRef.current['arrowright'] || command.steer > 0
                      ? 'border-cyan-400 bg-cyan-950/80 text-cyan-300 shadow-[0_0_15px_#22d3ee]'
                      : 'border-white/10 text-white hover:border-cyan-500/50'
                  } rounded flex items-center justify-center text-lg sm:text-xl font-bold cursor-pointer transition-all active:scale-95`}
                >
                  D
                </button>
              </div>

              <div className="text-[10px] text-gray-400 font-bold mt-0.5 uppercase tracking-widest font-mono">
                Hold to Drive • [C] Cruise
              </div>
            </div>

            {/* R-STICK Indicator */}
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-cyan-500/30 bg-cyan-500/5 flex items-center justify-center relative backdrop-blur-sm pointer-events-auto">
              <div
                className="w-11 h-11 sm:w-12 sm:h-12 bg-cyan-500/20 rounded-full border border-cyan-400 flex items-center justify-center transition-transform duration-75 shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                style={{
                  transform: `translateX(${(command.steer / 100) * 25}px)`
                }}
              >
                <span className="text-[9px] font-mono text-cyan-300 font-bold">
                  {command.steer === 0 ? '0°' : `${command.steer > 0 ? '+' : ''}${command.steer}°`}
                </span>
              </div>
              <span className="absolute -top-5 text-[10px] text-cyan-400 font-bold font-mono tracking-wider">
                R-STICK
              </span>
            </div>
          </div>
        </div>

        {/* Right Aside: Telemetry & System Actions */}
        <aside className="w-full lg:w-[280px] flex flex-col gap-4 shrink-0 overflow-y-auto">
          {/* Telemetry & Status Card */}
          <div className="flex-1 bg-[#0a0c12] border border-[#1a1c24] rounded-xl p-5 flex flex-col justify-between shadow-xl">
            <div>
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">
                Telemetry &amp; Status
              </h3>
              <div className="space-y-3.5 font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Speed</span>
                  <span className="text-lg font-bold text-cyan-400">{telemetry.speedKmh} km/h</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Heading</span>
                  <span className="text-lg font-bold text-white">{telemetry.heading.toFixed(1)}° S</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Pitch &amp; Roll</span>
                  <span className="text-sm font-bold text-cyan-300">{telemetry.pitch}° / {telemetry.roll}°</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Gear Ratio</span>
                  <span className="text-sm font-bold text-emerald-400">
                    {command.gear === 1 ? 'ECO (40%)' : command.gear === 2 ? 'CRUISE (75%)' : 'SPORT (100%)'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Temp</span>
                  <span className="text-lg font-bold text-orange-400">42.5°C</span>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-[#1a1c24]">
              <div className="text-[10px] text-gray-500 uppercase mb-2 font-bold font-mono">
                Command Log
              </div>
              <div className="text-[10px] space-y-1 font-mono text-emerald-500/80 bg-[#050608] p-2.5 rounded border border-[#1a1c24] max-h-28 overflow-y-auto">
                {commandLogs.map((log, idx) => (
                  <p key={idx} className={idx === commandLogs.length - 1 ? 'text-white font-bold' : ''}>
                    {log}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* System Actions Card */}
          <div className="h-44 bg-[#0a0c12] border border-[#1a1c24] rounded-xl p-5 flex flex-col justify-between shadow-xl shrink-0">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              System Actions
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {/* FLASHLIGHT */}
              <button
                onClick={() => {
                  const nextLight = !command.headlights;
                  dispatchCommand({ headlights: nextLight });
                  addLog(`FLASHLIGHT_${nextLight ? 'ACTIVATED' : 'DISABLED'}`);
                }}
                className={`text-[10px] font-bold py-2 rounded transition-colors uppercase ${
                  command.headlights
                    ? 'bg-cyan-600/40 border border-cyan-400 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.4)]'
                    : 'bg-cyan-600/20 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-600/40'
                }`}
              >
                FLASHLIGHT
              </button>

              {/* RECORD */}
              <button
                onClick={() => {
                  toggleRecording();
                  addLog(isRecording ? 'RECORDING_STOPPED' : 'RECORDING_STARTED');
                }}
                className={`border text-[10px] font-bold py-2 rounded transition-colors uppercase ${
                  isRecording
                    ? 'bg-rose-900/40 border-rose-500 text-rose-300 animate-pulse'
                    : 'bg-[#1a1c24] border-white/10 text-white hover:bg-[#252834]'
                }`}
              >
                {isRecording ? 'STOP REC' : 'RECORD'}
              </button>

              {/* SNAPSHOT */}
              <button
                onClick={() => {
                  captureSnapshot();
                  addLog('SNAPSHOT_CAPTURED');
                }}
                className="bg-[#1a1c24] border border-white/10 text-white text-[10px] font-bold py-2 rounded hover:bg-[#252834] transition-colors uppercase"
              >
                SNAPSHOT
              </button>

              {/* E-STOP */}
              <button
                onClick={() => {
                  dispatchCommand({ throttle: 0, steer: 0, brake: true });
                  addLog('EMERGENCY_STOP_TRIGGERED');
                  setTimeout(() => dispatchCommand({ brake: false }), 800);
                }}
                className="bg-red-900/20 border border-red-500/50 text-red-400 text-[10px] font-bold py-2 rounded hover:bg-red-900/40 transition-colors uppercase shadow-[0_0_10px_rgba(239,68,68,0.2)]"
              >
                E-STOP
              </button>
            </div>

            {/* Quick Gear Row */}
            <div className="flex items-center justify-between gap-1 pt-1">
              <button
                onClick={() => {
                  dispatchCommand({ gear: 1 });
                  addLog('GEAR_SET: ECO 40%');
                }}
                className={`flex-1 py-1 rounded text-[9px] font-mono font-bold border transition-colors ${
                  command.gear === 1 ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300' : 'bg-[#1a1c24] border-white/5 text-gray-400'
                }`}
              >
                ECO
              </button>
              <button
                onClick={() => {
                  dispatchCommand({ gear: 2 });
                  addLog('GEAR_SET: NORM 75%');
                }}
                className={`flex-1 py-1 rounded text-[9px] font-mono font-bold border transition-colors ${
                  command.gear === 2 ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300' : 'bg-[#1a1c24] border-white/5 text-gray-400'
                }`}
              >
                NORM
              </button>
              <button
                onClick={() => {
                  dispatchCommand({ gear: 3 });
                  addLog('GEAR_SET: SPORT 100%');
                }}
                className={`flex-1 py-1 rounded text-[9px] font-mono font-bold border transition-colors ${
                  command.gear === 3 ? 'bg-rose-500/30 border-rose-400 text-rose-300' : 'bg-[#1a1c24] border-white/5 text-gray-400'
                }`}
              >
                SPORT
              </button>
              <button
                onMouseDown={() => {
                  dispatchCommand({ horn: true });
                  addLog('HORN_HONK');
                }}
                onMouseUp={() => dispatchCommand({ horn: false })}
                onTouchStart={() => {
                  dispatchCommand({ horn: true });
                  addLog('HORN_HONK');
                }}
                onTouchEnd={() => dispatchCommand({ horn: false })}
                className="px-2.5 py-1 rounded text-[9px] font-mono font-bold bg-[#1a1c24] border border-white/10 text-white hover:bg-[#252834]"
              >
                HORN
              </button>
            </div>
          </div>
        </aside>
      </main>

      {/* 3. FOOTER (Telemetry & System Link) */}
      <footer className="h-12 border-t border-[#1a1c24] bg-[#0a0c12] px-6 flex items-center justify-between text-[10px] font-bold text-gray-500 shrink-0">
        <div className="flex gap-4 sm:gap-6 uppercase font-mono">
          <span>System Health: Nominal</span>
          <span className="hidden sm:inline">CPU Load: 12%</span>
          <span className="hidden md:inline">Memory: 2.1MB / 4.0MB</span>
        </div>
        <div className="text-cyan-600 font-mono text-[10px] tracking-wider uppercase">
          ESTABLISHED LINK VIA WEBSOCKETS (TLS)
        </div>
      </footer>

      {/* Troubleshooting & Disconnect Modal */}
      {showTroubleshoot && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0e14] border border-[#252834] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#1a1c24] flex items-center justify-between bg-[#11141c]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white uppercase tracking-wider">
                    Disconnection &amp; Motor Stop Diagnostics
                  </h2>
                  <p className="text-xs text-gray-400 font-mono">
                    কেন কিছুক্ষণ পর disconnect হয় এবং আর চলে না? (Root Causes &amp; Solutions)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTroubleshoot(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-sm">
              {/* Problem 1: Motor Brownout */}
              <div className="p-4 rounded-xl bg-[#141722] border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold font-mono text-xs uppercase">
                  <ShieldAlert className="w-4 h-4" />
                  <span>#1 Cause: Motor Voltage Sag (ESP32 Brownout Reset)</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  যখন RC কার Forward এ চলা শুরু করে, মোটরগুলো এক সাথে <strong>1.5A থেকে 2A</strong> কারেন্ট টানে। যদি ESP32 এবং মোটর ড্রাইভার (L298N) একই ব্যাটারি থেকে পাওয়ার পায়, তখন ভোল্টেজ এক মুহূর্তের জন্য 2.7V এর নিচে নেমে যায়। এতে ESP32 সাথে সাথে রিবুট (Restart) হয়ে যায়!
                </p>
                <div className="p-3 bg-black/40 rounded-lg border border-white/5 space-y-1.5 text-xs font-mono">
                  <p className="text-emerald-400 font-bold">✅ Solved in New Firmware:</p>
                  <p className="text-gray-400">
                    আমরা নতুন Arduino কোডে Brownout detector বন্ধ করে দিয়েছি (<code className="text-cyan-300">WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0)</code>) এবং BLE Auto-Reconnect যোগ করেছি।
                  </p>
                  <p className="text-amber-300 font-bold pt-1">💡 Hardware Tip for 100% Stability:</p>
                  <p className="text-gray-400">
                    ESP32 কে আলাদা একটি ছোট 5V পাওয়ার ব্যাংক বা আলাদা ব্যাটারি দিন, অথবা মোটর ড্রাইভারের 12V ও GND তে একটি <strong>1000µF 16V / 25V Capacitor</strong> লাগিয়ে দিন।
                  </p>
                </div>
              </div>

              {/* Problem 2: Android Sleep & Battery Optimization */}
              <div className="p-4 rounded-xl bg-[#141722] border border-[#252834] space-y-2">
                <div className="flex items-center gap-2 text-cyan-400 font-bold font-mono text-xs uppercase">
                  <Zap className="w-4 h-4" />
                  <span>#2 Cause: Android Screen Sleeping &amp; App Sleep</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  গাড়ির ফোনের স্ক্রিন লক হলে বা ব্যাকগ্রাউন্ডে চলে গেলে Android স্বয়ংক্রিয়ভাবে WebRTC ক্যামেরা ও ব্লুটুথ সংযোগ স্থগিত (freeze) করে দেয়।
                </p>
                <div className="p-3 bg-black/40 rounded-lg border border-white/5 text-xs space-y-1 font-mono">
                  <p className="text-cyan-300 font-bold">Fix:</p>
                  <p className="text-gray-400">
                    ফোনের স্ক্রিন সবসময় চালু রাখুন (Car Gateway তে <strong>Wake Lock</strong> অ্যাক্টিভ রাখা হয়েছে)। ফোনের পাওয়ার বাটন চেপে স্ক্রিন বন্ধ করবেন না।
                  </p>
                </div>
              </div>

              {/* Problem 3: Reconnection Button */}
              <div className="p-4 rounded-xl bg-[#141722] border border-[#252834] space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold font-mono text-xs uppercase">
                  <ShieldCheck className="w-4 h-4" />
                  <span>#3 Auto-Reconnect &amp; Manual Force Ping</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  এখন সিস্টেম যেকোনো নেটওয়ার্ক বা ব্লুটুথ ড্রপের পর ২ সেকেন্ড অন্তর স্বয়ংক্রিয়ভাবে পুনরায় সংযোগ স্থাপন করে। প্রয়োজনে নিচের বাটনে ক্লিক করে সাথে সাথে রিকানেক্ট করতে পারেন।
                </p>
                <div className="pt-2 flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      forceReconnectCar();
                      setShowTroubleshoot(false);
                    }}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-black font-bold font-mono text-xs rounded-lg transition-colors flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    FORCE RECONNECT CAR NOW
                  </button>
                  <button
                    onClick={() => {
                      setShowTroubleshoot(false);
                      onOpenGuide();
                    }}
                    className="px-4 py-2 bg-[#1a1c24] hover:bg-[#252834] text-white font-bold font-mono text-xs rounded-lg border border-white/10 transition-colors"
                  >
                    VIEW UPDATED ARDUINO FIRMWARE
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-[#1a1c24] bg-[#11141c] flex justify-end">
              <button
                onClick={() => setShowTroubleshoot(false)}
                className="px-4 py-1.5 bg-[#1a1c24] hover:bg-[#252834] text-gray-200 text-xs font-mono font-bold rounded-lg border border-white/10 transition-colors"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
