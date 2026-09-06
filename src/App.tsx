import React, { useState, useEffect } from 'react';
import {
  Car,
  Laptop,
  Smartphone,
  Cpu,
  Radio,
  Wifi,
  Zap,
  ArrowRight,
  Shield,
  Gauge,
  Video,
  Play,
  Share2,
  Copy,
  Check,
  Code
} from 'lucide-react';
import { PilotCockpit } from './components/PilotCockpit';
import { CarGateway } from './components/CarGateway';
import { FirmwareGuideModal } from './components/FirmwareGuideModal';

export default function App() {
  const [mode, setMode] = useState<'landing' | 'pilot' | 'car'>('landing');
  const [roomId, setRoomId] = useState('CAR01');
  const [showGuide, setShowGuide] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Read URL query params on initial load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const modeParam = params.get('mode');

    if (roomParam) {
      setRoomId(roomParam.toUpperCase());
    }
    if (modeParam === 'car') {
      setMode('car');
    } else if (modeParam === 'pilot') {
      setMode('pilot');
    }
  }, []);

  const shareCarLink = () => {
    const url = `${window.location.origin}/?mode=car&room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (mode === 'pilot') {
    return (
      <PilotCockpit
        roomId={roomId}
        onBackToMenu={() => setMode('landing')}
        onOpenGuide={() => setShowGuide(true)}
      />
    );
  }

  if (mode === 'car') {
    return (
      <CarGateway
        roomId={roomId}
        onBackToMenu={() => setMode('landing')}
        onOpenGuide={() => setShowGuide(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#050608] text-[#e0e0e0] flex flex-col justify-between select-none font-sans">
      {/* Top Header */}
      <header className="h-16 border-b border-[#1a1c24] flex items-center justify-between px-6 bg-[#0a0c12]">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_10px_#22d3ee] animate-pulse"></div>
          <div>
            <h1 className="text-base sm:text-xl font-bold tracking-widest uppercase text-cyan-50 flex items-center gap-2">
              ESP32-ROVER COMMAND CENTER
              <span className="text-[10px] uppercase font-bold tracking-widest bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/30">
                LIVE TELEOP
              </span>
            </h1>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-6 text-xs font-mono">
          <div className="flex flex-col items-end">
            <span className="text-gray-500 text-[10px] uppercase">SIGNAL STRENGTH</span>
            <span className="text-cyan-400 font-bold">-42 dBm (EXCELLENT)</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-gray-500 text-[10px] uppercase">LATENCY TARGET</span>
            <span className="text-emerald-400 font-bold">&lt; 25ms</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-gray-500 text-[10px] uppercase">TRANSPORT</span>
            <span className="text-gray-300 font-bold">WEBRTC + WS</span>
          </div>
          <button
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1c24] hover:bg-[#252834] text-cyan-400 border border-cyan-500/30 rounded text-xs font-bold transition-all shadow"
          >
            <Cpu className="w-3.5 h-3.5" />
            ARDUINO GUIDE
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto w-full px-4 py-8 sm:py-10 flex-1 flex flex-col items-center justify-center">
        {/* Title */}
        <div className="text-center max-w-2xl mx-auto mb-8 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            TACTICAL LOW-LATENCY ESP32 REMOTE DRIVING SYSTEM
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight uppercase">
            REMOTE VEHICLE <br className="hidden sm:inline" />
            <span className="text-cyan-400">TELEOPERATION TERMINAL</span>
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 leading-relaxed max-w-xl mx-auto">
            Mount an Android phone inside your ESP32 RC car for direct WebRTC 60FPS video relay.
            Control drive motors, throttle PWM, and telemetry from anywhere over the internet.
          </p>
        </div>

        {/* Room ID Session Input */}
        <div className="w-full max-w-md bg-[#0a0c12] border border-[#1a1c24] rounded-xl p-5 shadow-2xl mb-8">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block">
              SECURE SESSION ROOM ID
            </label>
            <span className="text-[10px] font-mono text-cyan-400">ENCRYPTED P2P</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
              placeholder="e.g. CAR01"
              maxLength={12}
              className="flex-1 bg-[#050608] border border-[#1a1c24] focus:border-cyan-500/50 rounded px-4 py-2.5 text-base font-mono font-bold text-cyan-400 outline-none transition-colors uppercase"
            />
            <button
              onClick={shareCarLink}
              title="Copy Android Phone Link"
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-[#1a1c24] hover:bg-[#252834] text-gray-200 border border-white/10 rounded text-xs font-bold font-mono transition-colors"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-cyan-400" />}
              {copiedLink ? 'COPIED' : 'PHONE LINK'}
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-2 font-mono">
            Laptop Cockpit and Car Phone must use identical Session Room ID.
          </p>
        </div>

        {/* Dual Mode Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
          {/* Card 1: Pilot Cockpit (Laptop) */}
          <div className="group bg-[#0a0c12] border border-[#1a1c24] hover:border-cyan-500/60 rounded-xl p-6 shadow-2xl transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded bg-[#1a1c24] border border-cyan-500/40 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform shadow-[0_0_15px_rgba(34,211,238,0.15)]">
                <Laptop className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-white mb-1 uppercase tracking-wide flex items-center gap-2">
                  PILOT COCKPIT HUD
                </h3>
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest block mb-2 font-mono">
                  FOR LAPTOP / DESKTOP PILOT
                </span>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Real-time FPV cockpit with artificial horizon, digital speedometer, WASD keyboard keys, and Gamepad controller support.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pt-1 text-[10px] text-gray-400 font-mono">
                <span className="bg-[#050608] px-2 py-1 rounded border border-[#1a1c24] text-cyan-300">⌨️ WASD KEYS</span>
                <span className="bg-[#050608] px-2 py-1 rounded border border-[#1a1c24] text-emerald-400">🎮 USB GAMEPAD</span>
                <span className="bg-[#050608] px-2 py-1 rounded border border-[#1a1c24] text-gray-300">📡 WEBRTC 60FPS</span>
              </div>
            </div>

            <button
              onClick={() => setMode('pilot')}
              className="mt-6 w-full py-3 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/50 text-cyan-400 font-bold rounded text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(34,211,238,0.15)]"
            >
              LAUNCH PILOT COCKPIT
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card 2: Car Gateway (Android Phone) */}
          <div className="group bg-[#0a0c12] border border-[#1a1c24] hover:border-cyan-500/60 rounded-xl p-6 shadow-2xl transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded bg-[#1a1c24] border border-emerald-500/40 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                <Smartphone className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-white mb-1 uppercase tracking-wide flex items-center gap-2">
                  CAR ONBOARD GATEWAY
                </h3>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block mb-2 font-mono">
                  MOUNTED ON ANDROID PHONE
                </span>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Mount smartphone in RC car. Relays camera video at low latency and bridges commands to ESP32 via Bluetooth (BLE) or USB OTG.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pt-1 text-[10px] text-gray-400 font-mono">
                <span className="bg-[#050608] px-2 py-1 rounded border border-[#1a1c24] text-emerald-400">📷 720P HD FEED</span>
                <span className="bg-[#050608] px-2 py-1 rounded border border-[#1a1c24] text-cyan-300">⚡ WEB-BLUETOOTH</span>
                <span className="bg-[#050608] px-2 py-1 rounded border border-[#1a1c24] text-gray-300">🔌 USB SERIAL</span>
              </div>
            </div>

            <button
              onClick={() => setMode('car')}
              className="mt-6 w-full py-3 bg-[#1a1c24] hover:bg-[#252834] border border-white/10 text-white font-bold rounded text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2"
            >
              START CAR STREAMER
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Arduino Guide bar */}
        <div className="mt-8 p-4 max-w-3xl w-full bg-[#0a0c12] border border-[#1a1c24] rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-white uppercase tracking-wide">ESP32 Arduino Firmware &amp; L298N Wiring</p>
              <p className="text-[11px] text-gray-400">Includes complete Arduino C++ code, pinout map, and step-by-step setup guide.</p>
            </div>
          </div>
          <button
            onClick={() => setShowGuide(true)}
            className="shrink-0 px-4 py-2 bg-[#1a1c24] hover:bg-[#252834] text-cyan-400 rounded text-xs font-bold border border-cyan-500/30 font-mono uppercase transition-colors"
          >
            VIEW FIRMWARE
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-12 border-t border-[#1a1c24] bg-[#0a0c12] px-6 flex items-center justify-between text-[10px] font-bold text-gray-500">
        <div className="flex gap-6 uppercase">
          <span>System Health: Nominal</span>
          <span>Core: ESP32 + WebRTC</span>
          <span>Security: TLS / DTLS</span>
        </div>
        <div className="text-cyan-600 font-mono uppercase">ESTABLISHED LINK VIA WEBSOCKETS (TLS)</div>
      </footer>

      {/* Guide Modal */}
      <FirmwareGuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
      />
    </div>
  );
}
