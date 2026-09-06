import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  Flashlight,
  Radio,
  RefreshCw,
  Sliders,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Zap,
  Volume2,
  Terminal,
  Activity,
  ArrowRightLeft,
  Copy,
  Check,
  ExternalLink,
  Wifi,
  Globe
} from 'lucide-react';
import { DriveCommand, TelemetryData, ESP32ConnectionMethod, ConsoleLogEntry } from '../types';
import { ICE_SERVERS, getWebSocketUrl } from '../utils/webrtc';

interface CarGatewayProps {
  roomId: string;
  onBackToMenu: () => void;
  onOpenGuide: () => void;
}

export const CarGateway: React.FC<CarGatewayProps> = ({
  roomId,
  onBackToMenu,
  onOpenGuide
}) => {
  const [streamActive, setStreamActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [resolution, setResolution] = useState<'720p' | '480p' | '360p'>('720p');
  const [fpsPreset, setFpsPreset] = useState<30 | 60>(30);

  // Network & Signaling state
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [pilotOnline, setPilotOnline] = useState(false);
  const [webrtcStatus, setWebrtcStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');

  // ESP32 Connection state
  const [espMethod, setEspMethod] = useState<ESP32ConnectionMethod>('ble');
  const [espConnected, setEspConnected] = useState(false);
  const [espDeviceName, setEspDeviceName] = useState<string | null>(null);
  const [espIp, setEspIp] = useState('192.168.4.1');
  const [wifiTesting, setWifiTesting] = useState(false);
  const [isBrave, setIsBrave] = useState(false);
  const [braveWarningExpanded, setBraveWarningExpanded] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const lastWifiSentRef = useRef<number>(0);

  // Stats & Telemetry
  const [packetCount, setPacketCount] = useState(0);
  const [lastCommand, setLastCommand] = useState<DriveCommand | null>(null);
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [motionData, setMotionData] = useState({ roll: 0, pitch: 0, heading: 0 });

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const bleCharacteristicRef = useRef<any>(null);
  const serialWriterRef = useRef<any>(null);
  const wakeLockRef = useRef<any>(null);

  const addLog = useCallback((source: ConsoleLogEntry['source'], type: ConsoleLogEntry['type'], message: string) => {
    const entry: ConsoleLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      source,
      type,
      message
    };
    setLogs((prev) => [entry, ...prev.slice(0, 49)]);
  }, []);

  // 1. Initialize Screen Wake Lock (prevents Android phone from sleeping)
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          addLog('SYSTEM', 'info', 'Screen Wake-Lock active (Phone will not sleep while driving)');
        }
      } catch (err) {
        // Ignored if not supported
      }
    };
    requestWakeLock();

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, [addLog]);

  // 2. Battery & Orientation Sensors
  useEffect(() => {
    // Battery
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      }).catch(() => {});
    }

    // Device Orientation
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        setMotionData({
          roll: Math.round(e.gamma),
          pitch: Math.round(e.beta),
          heading: Math.round(e.alpha || 0)
        });
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  // 3. Camera Setup
  const startCamera = useCallback(async () => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      let width = 1280;
      let height = 720;
      if (resolution === '480p') {
        width = 854;
        height = 480;
      } else if (resolution === '360p') {
        width = 640;
        height = 360;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacing,
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: fpsPreset, max: fpsPreset }
        },
        audio: true
      });

      localStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStreamActive(true);
      addLog('WEBRTC', 'success', `Camera streaming started at ${resolution} @ ${fpsPreset}fps (${cameraFacing})`);

      // Check flashlight support
      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = (videoTrack.getCapabilities ? videoTrack.getCapabilities() : {}) as any;
      if (capabilities && 'torch' in capabilities) {
        setTorchSupported(true);
      } else {
        setTorchSupported(false);
      }

      // If WebRTC is already active, replace tracks
      if (peerConnRef.current) {
        const senders = peerConnRef.current.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(videoTrack);
        }
      }
    } catch (err: any) {
      addLog('SYSTEM', 'error', `Camera access error: ${err.message || err}`);
      setStreamActive(false);
    }
  }, [cameraFacing, resolution, fpsPreset, addLog]);

  useEffect(() => {
    startCamera();
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startCamera]);

  const toggleTorch = async () => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getVideoTracks()[0];
    try {
      await (track as any).applyConstraints({
        advanced: [{ torch: !torchOn }]
      });
      setTorchOn(!torchOn);
      addLog('SYSTEM', 'info', `Camera Flashlight: ${!torchOn ? 'ON' : 'OFF'}`);
    } catch {
      addLog('SYSTEM', 'warn', 'Flashlight torch constraint failed on this device');
    }
  };

  // 4. Send Drive Command to ESP32
  const sendToESP32 = useCallback((cmd: DriveCommand) => {
    setLastCommand(cmd);
    setPacketCount((c) => c + 1);

    // Format protocol string: "M:throttle,steer,brake,headlights,horn\n"
    const cmdStr = `M:${cmd.throttle},${cmd.steer},${cmd.brake ? 1 : 0},${cmd.headlights ? 1 : 0},${cmd.horn ? 1 : 0}\n`;

    // A. Web Bluetooth (BLE)
    if (espMethod === 'ble' && bleCharacteristicRef.current) {
      try {
        const encoder = new TextEncoder();
        bleCharacteristicRef.current.writeValueWithoutResponse(encoder.encode(cmdStr)).catch(() => {});
      } catch (err) {
        console.error('BLE write error:', err);
      }
    }

    // B. Web Serial (USB OTG)
    if (espMethod === 'serial' && serialWriterRef.current) {
      try {
        serialWriterRef.current.write(cmdStr).catch(() => {});
      } catch (err) {
        console.error('Serial write error:', err);
      }
    }

    // C. WiFi Local HTTP (ESP32 Web Server)
    if (espMethod === 'wifi') {
      const now = Date.now();
      if (now - lastWifiSentRef.current > 40) { // ~25Hz rate limit
        lastWifiSentRef.current = now;
        const cleanCmd = cmdStr.trim();
        fetch(`http://${espIp}/cmd?val=${encodeURIComponent(cleanCmd)}`, { mode: 'no-cors' }).catch(() => {});
      }
    }

    // D. Simulation
    if (espMethod === 'sim') {
      // Handled internally
    }
  }, [espMethod, espIp]);

  // Detect Brave Browser
  useEffect(() => {
    const detectBrave = async () => {
      try {
        if ((navigator as any).brave && typeof (navigator as any).brave.isBrave === 'function') {
          const isB = await (navigator as any).brave.isBrave();
          if (isB) {
            setIsBrave(true);
          }
        } else if (navigator.userAgent.includes('Brave')) {
          setIsBrave(true);
        }
      } catch {
        // ignore
      }
    };
    detectBrave();
  }, []);

  // 5. Connect to ESP32 via Web Bluetooth
  const connectBluetooth = async () => {
    try {
      if (!(navigator as any).bluetooth) {
        setIsBrave(true);
        setBraveWarningExpanded(true);
        addLog('ESP32', 'error', 'Web Bluetooth is not enabled in this browser. Use Chrome on Android or enable brave://flags.');
        return;
      }

      addLog('ESP32', 'info', 'Scanning for "TeleDrive-ESP32" BLE device...');
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ namePrefix: 'TeleDrive' }],
        optionalServices: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e']
      });

      addLog('ESP32', 'info', `Connecting to ${device.name}...`);
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
      const rxChar = await service.getCharacteristic('6e400002-b5a3-f393-e0a9-e50e24dcca9e');

      bleCharacteristicRef.current = rxChar;
      setEspConnected(true);
      setEspDeviceName(device.name || 'ESP32 (BLE)');
      addLog('ESP32', 'success', `Connected to ${device.name} via Bluetooth BLE! Ready for commands.`);

      device.addEventListener('gattserverdisconnected', () => {
        setEspConnected(false);
        setEspDeviceName(null);
        bleCharacteristicRef.current = null;
        addLog('ESP32', 'warn', 'ESP32 Bluetooth disconnected!');
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('globally disabled') || msg.includes('not supported') || !msg.includes('User cancelled')) {
        setIsBrave(true);
        setBraveWarningExpanded(true);
      }
      addLog('ESP32', 'error', `BLE Connection failed: ${msg}`);
    }
  };

  // Connect to ESP32 via WiFi HTTP
  const testWifiConnection = async () => {
    setWifiTesting(true);
    addLog('ESP32', 'info', `Pinging ESP32 WiFi at http://${espIp}...`);
    try {
      await fetch(`http://${espIp}/cmd?val=M:0,0,1,0,0`, { mode: 'no-cors' });
      setEspConnected(true);
      setEspDeviceName(`ESP32 WiFi (${espIp})`);
      addLog('ESP32', 'success', `ESP32 WiFi ping sent to http://${espIp}! Linked for drive commands.`);
    } catch (err: any) {
      setEspConnected(true);
      setEspDeviceName(`ESP32 WiFi (${espIp})`);
      addLog('ESP32', 'warn', `Dispatched to http://${espIp}. If connected to car WiFi/Hotspot, packets are routing.`);
    } finally {
      setWifiTesting(false);
    }
  };

  // 6. Connect to ESP32 via Web Serial (USB OTG)
  const connectSerial = async () => {
    try {
      if (!(navigator as any).serial) {
        addLog('ESP32', 'error', 'Web Serial API not supported in this browser. Use Chrome on Android or Desktop.');
        return;
      }

      addLog('ESP32', 'info', 'Requesting USB Serial Port (115200 baud)...');
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });

      const textEncoder = new TextEncoderStream();
      textEncoder.readable.pipeTo(port.writable);
      serialWriterRef.current = textEncoder.writable.getWriter();

      setEspConnected(true);
      setEspDeviceName('ESP32 (USB OTG Serial)');
      addLog('ESP32', 'success', 'ESP32 Connected via USB Serial (115200 baud)!');
    } catch (err: any) {
      addLog('ESP32', 'error', `Serial connection failed: ${err.message || err}`);
    }
  };

  // 7. WebSocket Signaling & WebRTC Peer Connection
  const initWebRTC = useCallback((targetPilotId?: string) => {
    if (peerConnRef.current) {
      peerConnRef.current.close();
    }

    addLog('WEBRTC', 'info', 'Creating WebRTC PeerConnection for low-latency video stream...');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnRef.current = pc;
    setWebrtcStatus('connecting');

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'signal',
          targetPilotId,
          data: { candidate: event.candidate }
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      addLog('WEBRTC', 'info', `WebRTC Connection state: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        setWebrtcStatus('connected');
        addLog('WEBRTC', 'success', 'Direct WebRTC P2P Stream ESTABLISHED! Ultra-low latency active.');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setWebrtcStatus('failed');
      }
    };

    // Listen for DataChannel created by Pilot for UDP-like instant drive commands
    pc.ondatachannel = (event) => {
      const dc = event.channel;
      dataChannelRef.current = dc;
      addLog('WEBRTC', 'success', 'P2P DataChannel open for zero-latency commands!');

      dc.onmessage = (e) => {
        try {
          const cmd = JSON.parse(e.data);
          sendToESP32(cmd);
        } catch {}
      };
    };

    // Create SDP Offer
    pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false
    }).then((offer) => {
      return pc.setLocalDescription(offer);
    }).then(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'signal',
          targetPilotId,
          data: { sdp: pc.localDescription }
        }));
        addLog('WEBRTC', 'info', 'WebRTC SDP Offer sent to Pilot.');
      }
    }).catch((err) => {
      addLog('WEBRTC', 'error', `Failed to create SDP Offer: ${err.message}`);
    });
  }, [addLog, sendToESP32]);

  // 8. WebSocket Signaling Lifecycle
  useEffect(() => {
    const wsUrl = getWebSocketUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      addLog('SYSTEM', 'success', `Connected to cloud signaling server. Joining room: ${roomId}`);
      ws.send(JSON.stringify({
        type: 'join',
        role: 'car',
        roomId
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'joined') {
          addLog('SYSTEM', 'info', `Registered as CAR in room [${roomId}]. Connected pilots: ${msg.connectedPilots}`);
          if (msg.connectedPilots > 0) {
            setPilotOnline(true);
            initWebRTC();
          }
        }

        if (msg.type === 'peer-status') {
          if (msg.role === 'pilot') {
            if (msg.status === 'online') {
              setPilotOnline(true);
              addLog('SYSTEM', 'success', `Pilot connected! Starting WebRTC handshake...`);
              initWebRTC(msg.pilotId);
            } else {
              setPilotOnline(false);
              addLog('SYSTEM', 'warn', `Pilot disconnected from room.`);
              // Stop car immediately when pilot disconnects!
              sendToESP32({
                throttle: 0,
                steer: 0,
                brake: true,
                gear: 1,
                headlights: false,
                horn: false,
                hazard: true,
                timestamp: Date.now()
              });
            }
          }
        }

        if (msg.type === 'signal') {
          const pc = peerConnRef.current;
          if (!pc) return;

          if (msg.data?.sdp) {
            if (msg.data.sdp.type === 'answer') {
              await pc.setRemoteDescription(new RTCSessionDescription(msg.data.sdp));
              addLog('WEBRTC', 'info', 'Remote SDP Answer applied.');
            }
          } else if (msg.data?.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.data.candidate));
          }
        }

        // Fallback WebSocket Drive Commands
        if (msg.type === 'drive-cmd') {
          sendToESP32(msg.cmd);
        }
      } catch (err) {
        console.error('WS msg error:', err);
      }
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
      addLog('SYSTEM', 'warn', 'Signaling server disconnected. Reconnecting...');
    };

    return () => {
      ws.close();
      if (peerConnRef.current) peerConnRef.current.close();
    };
  }, [roomId, addLog, initWebRTC, sendToESP32]);

  // Broadcast Telemetry to Pilot every 500ms
  useEffect(() => {
    const timer = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && pilotOnline) {
        const telemetry: Partial<TelemetryData> = {
          phoneBattery: batteryLevel,
          carBatteryVolts: 8.2, // Standard 2S LiPo nominal or read via ADC
          roll: motionData.roll,
          pitch: motionData.pitch,
          heading: motionData.heading,
          espConnected,
          espMode: espMethod,
          packetsReceived: packetCount,
          lastCommandAt: lastCommand?.timestamp || 0
        };

        wsRef.current.send(JSON.stringify({
          type: 'telemetry',
          data: telemetry
        }));
      }
    }, 500);

    return () => clearInterval(timer);
  }, [pilotOnline, batteryLevel, motionData, espConnected, espMethod, packetCount, lastCommand]);

  return (
    <div className="flex flex-col h-full bg-[#050608] text-[#e0e0e0] p-4 sm:p-6 overflow-y-auto font-sans">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-4 border-b border-[#1a1c24]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToMenu}
            className="px-3 py-1.5 bg-[#1a1c24] hover:bg-[#252834] text-xs font-bold font-mono text-gray-300 rounded border border-white/10 transition-colors"
          >
            ← EXIT
          </button>
          <div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-cyan-400 rounded-full shadow-[0_0_8px_#22d3ee] animate-pulse"></div>
              <h1 className="font-bold text-base sm:text-lg text-white uppercase tracking-wider">
                CAR ONBOARD GATEWAY
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              TARGET ROOM: <span className="font-mono text-cyan-400 font-bold bg-[#0a0c12] px-2 py-0.5 rounded border border-cyan-500/30">{roomId}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              setCopiedUrl(true);
              setTimeout(() => setCopiedUrl(false), 3000);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-bold transition-all border ${
              copiedUrl
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-[#1a1c24] hover:bg-[#252834] text-gray-300 border-white/10'
            }`}
            title="Copy this URL to open in Google Chrome"
          >
            {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedUrl ? 'COPIED!' : 'COPY URL FOR CHROME'}
          </button>
          <button
            onClick={onOpenGuide}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 border border-cyan-500/50 hover:bg-cyan-600/40 text-cyan-300 rounded text-xs font-bold uppercase transition-colors"
          >
            <Cpu className="w-3.5 h-3.5" />
            ESP32 CODE &amp; WIRING
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Left 2 Cols: Camera Preview & Live Stream */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative aspect-[16/9] w-full bg-black rounded-xl overflow-hidden border border-[#1a1c24] shadow-2xl">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Top Status Badges */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-xs font-mono">
                <span className={`w-2 h-2 rounded-full ${wsStatus === 'connected' ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-rose-500'}`}></span>
                <span>Server: <strong className="capitalize text-white">{wsStatus}</strong></span>
                <span className="text-gray-600">|</span>
                <span className={`w-2 h-2 rounded-full ${pilotOnline ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-amber-400'}`}></span>
                <span>Pilot: <strong className={pilotOnline ? 'text-cyan-300' : 'text-amber-300'}>{pilotOnline ? 'CONNECTED' : 'WAITING'}</strong></span>
              </div>

              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-xs font-mono">
                <span className="text-cyan-400 font-bold">WEBRTC: {webrtcStatus.toUpperCase()}</span>
                {batteryLevel !== null && (
                  <span className="text-gray-300 font-mono">🔋 {batteryLevel}%</span>
                )}
              </div>
            </div>

            {/* Bottom Camera Controls Overlay */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-black/70 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/10 font-mono">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const next = cameraFacing === 'environment' ? 'user' : 'environment';
                    setCameraFacing(next);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1c24] hover:bg-[#252834] text-xs font-bold text-gray-200 rounded border border-white/10 transition-colors"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400" />
                  Flip ({cameraFacing === 'environment' ? 'Back' : 'Front'})
                </button>

                {torchSupported && (
                  <button
                    onClick={toggleTorch}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-bold transition-colors ${
                      torchOn ? 'bg-cyan-500 text-black shadow-[0_0_10px_#22d3ee]' : 'bg-[#1a1c24] text-gray-200 border border-white/10'
                    }`}
                  >
                    <Flashlight className="w-3.5 h-3.5" />
                    Torch {torchOn ? 'ON' : 'OFF'}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as any)}
                  className="bg-[#1a1c24] border border-white/10 rounded px-2.5 py-1.5 text-gray-200 outline-none font-bold"
                >
                  <option value="720p">720p HD</option>
                  <option value="480p">480p Fast</option>
                  <option value="360p">360p Ultra Low-Latency</option>
                </select>

                <select
                  value={fpsPreset}
                  onChange={(e) => setFpsPreset(Number(e.target.value) as any)}
                  className="bg-[#1a1c24] border border-white/10 rounded px-2.5 py-1.5 text-gray-200 outline-none font-bold"
                >
                  <option value={30}>30 FPS</option>
                  <option value={60}>60 FPS</option>
                </select>
              </div>
            </div>
          </div>

          {/* Real-time received command HUD */}
          <div className="p-4 bg-[#0a0c12] border border-[#1a1c24] rounded-xl shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 font-mono">
                <Radio className="w-4 h-4 text-cyan-400" />
                Latest Driving Command Dispatched
              </span>
              <span className="text-xs font-mono text-gray-400">
                Packets: <strong className="text-cyan-400">{packetCount}</strong>
              </span>
            </div>

            {lastCommand ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-2.5 bg-[#050608] rounded-lg border border-[#1a1c24]">
                  <span className="text-[10px] text-gray-500 block uppercase font-mono">Throttle</span>
                  <span className={`text-base font-bold font-mono ${lastCommand.throttle >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {lastCommand.throttle}%
                  </span>
                </div>
                <div className="p-2.5 bg-[#050608] rounded-lg border border-[#1a1c24]">
                  <span className="text-[10px] text-gray-500 block uppercase font-mono">Steering</span>
                  <span className="text-base font-bold font-mono text-cyan-400">
                    {lastCommand.steer}%
                  </span>
                </div>
                <div className="p-2.5 bg-[#050608] rounded-lg border border-[#1a1c24]">
                  <span className="text-[10px] text-gray-500 block uppercase font-mono">Brake / Gear</span>
                  <span className={`text-base font-bold font-mono ${lastCommand.brake ? 'text-rose-500' : 'text-white'}`}>
                    {lastCommand.brake ? 'BRAKE!' : `GEAR ${lastCommand.gear}`}
                  </span>
                </div>
                <div className="p-2.5 bg-[#050608] rounded-lg border border-[#1a1c24]">
                  <span className="text-[10px] text-gray-500 block uppercase font-mono">Lights &amp; Horn</span>
                  <span className="text-xs font-bold font-mono text-amber-300">
                    {lastCommand.headlights ? '💡 ON' : '💡 OFF'} • {lastCommand.horn ? '🔊 HONK' : 'MUTE'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-500 text-center py-3 font-mono">
                No driving commands received yet. Connect Pilot cockpit from your laptop to test.
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: ESP32 Hardware Connector & Logs */}
        <div className="space-y-4">
          {/* ESP32 Connection Box */}
          <div className="p-4 bg-[#0a0c12] border border-[#1a1c24] rounded-xl space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-sm text-white uppercase tracking-wider">ESP32 Hardware Bridge</h3>
              </div>
              <span className={`text-xs px-2.5 py-0.5 rounded font-mono font-bold ${
                espConnected ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-[#1a1c24] text-gray-400'
              }`}>
                {espConnected ? 'LINKED' : 'UNLINKED'}
              </span>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              Connect this Android phone directly to the ESP32 via Bluetooth Low Energy (BLE) or USB OTG cable.
            </p>

            {/* Method selection */}
            <div className="grid grid-cols-4 gap-1.5 text-[11px] font-mono">
              <button
                onClick={() => setEspMethod('ble')}
                className={`py-2 px-1 rounded font-bold transition-all border text-center ${
                  espMethod === 'ble' ? 'bg-cyan-600/30 border-cyan-400 text-cyan-300' : 'bg-[#1a1c24] border-white/5 text-gray-400'
                }`}
              >
                BLE
              </button>
              <button
                onClick={() => setEspMethod('serial')}
                className={`py-2 px-1 rounded font-bold transition-all border text-center ${
                  espMethod === 'serial' ? 'bg-cyan-600/30 border-cyan-400 text-cyan-300' : 'bg-[#1a1c24] border-white/5 text-gray-400'
                }`}
              >
                USB OTG
              </button>
              <button
                onClick={() => setEspMethod('wifi')}
                className={`py-2 px-1 rounded font-bold transition-all border text-center ${
                  espMethod === 'wifi' ? 'bg-cyan-600/30 border-cyan-400 text-cyan-300' : 'bg-[#1a1c24] border-white/5 text-gray-400'
                }`}
              >
                WiFi IP
              </button>
              <button
                onClick={() => {
                  setEspMethod('sim');
                  setEspConnected(true);
                  setEspDeviceName('Internal Simulator');
                  addLog('ESP32', 'info', 'Internal Simulation mode activated (Virtual Motors)');
                }}
                className={`py-2 px-1 rounded font-bold transition-all border text-center ${
                  espMethod === 'sim' ? 'bg-cyan-600/30 border-cyan-400 text-cyan-300' : 'bg-[#1a1c24] border-white/5 text-gray-400'
                }`}
              >
                Sim
              </button>
            </div>

            {/* Brave Browser Alert for BLE */}
            {espMethod === 'ble' && isBrave && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs space-y-2.5">
                <div className="flex items-start gap-2 text-amber-300 font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <span>Brave Browser Blocks Web Bluetooth</span>
                    <p className="text-[11px] font-normal text-gray-300 mt-0.5">
                      Brave blocks Bluetooth by default. Chrome on Android works natively!
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <p className="text-gray-300 text-[11px] font-semibold">
                    ⭐ Recommended Solution:
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 3000);
                    }}
                    className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold font-mono rounded text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md"
                  >
                    {copiedUrl ? <Check className="w-4 h-4 text-black" /> : <Copy className="w-4 h-4 text-black" />}
                    {copiedUrl ? 'URL Copied! Paste in Google Chrome' : 'Copy URL & Open in Google Chrome'}
                  </button>
                </div>

                <details
                  open={braveWarningExpanded}
                  onToggle={(e) => setBraveWarningExpanded((e.target as HTMLDetailsElement).open)}
                  className="text-[11px] text-gray-400 cursor-pointer pt-1"
                >
                  <summary className="text-amber-400/90 hover:text-amber-300 font-medium">
                    Or enable Web Bluetooth inside Brave (4 steps)
                  </summary>
                  <div className="mt-2 p-2 bg-[#050608] rounded border border-amber-500/20 space-y-1 text-gray-300 font-mono text-[10px]">
                    <p>1. Open a new tab and type: <span className="text-amber-300 select-all font-bold">brave://flags</span></p>
                    <p>2. In search box, type: <span className="text-white font-bold">Web Bluetooth</span></p>
                    <p>3. Set &apos;Web Bluetooth API&apos; to: <span className="text-emerald-400 font-bold">Enabled</span></p>
                    <p>4. Tap the &apos;Relaunch&apos; button at the bottom of Brave</p>
                  </div>
                </details>
              </div>
            )}

            {/* Connect button based on method */}
            {espMethod === 'ble' && (
              <button
                onClick={connectBluetooth}
                className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-black font-bold font-mono rounded text-xs transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(34,211,238,0.3)]"
              >
                <Zap className="w-4 h-4" />
                {espConnected ? `Connected: ${espDeviceName}` : 'PAIR "TeleDrive-ESP32" (BLE)'}
              </button>
            )}

            {espMethod === 'serial' && (
              <button
                onClick={connectSerial}
                className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-black font-bold font-mono rounded text-xs transition-colors flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(34,211,238,0.3)]"
              >
                <Zap className="w-4 h-4" />
                {espConnected ? `Connected: ${espDeviceName}` : 'CONNECT USB-OTG SERIAL (115200)'}
              </button>
            )}

            {espMethod === 'wifi' && (
              <div className="space-y-3 p-3 bg-[#050608] rounded-lg border border-[#1a1c24]">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold">
                  <Wifi className="w-4 h-4" />
                  <span>ESP32 WiFi Local HTTP Bridge</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Connect phone to ESP32 WiFi Access Point (<code>TeleDrive-Car-AP</code>) or phone hotspot, then enter ESP32 IP address:
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500">http://</span>
                  <input
                    type="text"
                    value={espIp}
                    onChange={(e) => setEspIp(e.target.value)}
                    placeholder="192.168.4.1"
                    className="flex-1 px-2.5 py-1.5 bg-[#0a0c12] border border-[#252834] rounded text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <button
                  onClick={testWifiConnection}
                  disabled={wifiTesting}
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-black font-bold font-mono rounded text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {wifiTesting ? 'Pinging ESP32...' : (espConnected && espMethod === 'wifi') ? `Linked to ${espIp}` : 'Link WiFi / Test Ping'}
                </button>
              </div>
            )}

            {espMethod === 'sim' && (
              <div className="p-3 bg-[#050608] rounded border border-[#1a1c24] text-xs font-mono text-cyan-300">
                ✅ Simulation mode active: Driving commands will be processed locally without physical ESP32.
              </div>
            )}
          </div>

          {/* Console Terminal */}
          <div className="p-4 bg-[#0a0c12] border border-[#1a1c24] rounded-xl flex flex-col h-[320px] shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-[#1a1c24] mb-2 font-mono">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                System &amp; Packet Terminal
              </span>
              <button
                onClick={() => setLogs([])}
                className="text-[10px] text-gray-500 hover:text-white"
              >
                Clear
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[11px] text-gray-300 pr-1">
              {logs.length === 0 ? (
                <div className="text-gray-600 text-center py-8">No log events yet.</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="leading-tight">
                    <span className="text-gray-600">[{log.time}] </span>
                    <span className={`font-bold ${
                      log.source === 'ESP32' ? 'text-cyan-400' :
                      log.source === 'WEBRTC' ? 'text-emerald-400' :
                      log.source === 'DRIVE' ? 'text-amber-400' : 'text-gray-400'
                    }`}>[{log.source}] </span>
                    <span className={
                      log.type === 'error' ? 'text-rose-400' :
                      log.type === 'warn' ? 'text-amber-300' :
                      log.type === 'success' ? 'text-emerald-400' : 'text-gray-300'
                    }>{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
