import React, { useState } from 'react';
import { X, Copy, Check, Download, Cpu, Wrench, AlertTriangle, ExternalLink, Lightbulb } from 'lucide-react';
import { ESP32_ARDUINO_CODE, WIRING_GUIDE } from '../utils/esp32Firmware';

interface FirmwareGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirmwareGuideModal: React.FC<FirmwareGuideModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'wiring' | 'steps' | 'bengali'>('bengali');

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(ESP32_ARDUINO_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const blob = new Blob([ESP32_ARDUINO_CODE], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'TeleDrive_ESP32_Firmware.ino';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in font-sans">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[#0a0c12] border border-[#1a1c24] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[#e0e0e0]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a1c24] bg-[#050608]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white uppercase tracking-wider">ESP32 Firmware &amp; Hardware Wiring Guide</h2>
              <p className="text-xs text-gray-400">সম্পূর্ণ Arduino C++ কোড ও সার্কিট সংযোগ গাইড (Low-Latency Tele-Drive)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#1a1c24] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab selector */}
        <div className="flex items-center gap-2 px-6 py-2.5 bg-[#0a0c12] border-b border-[#1a1c24] text-xs font-mono">
          <button
            onClick={() => setActiveTab('bengali')}
            className={`px-3 py-1.5 rounded font-bold transition-all border ${
              activeTab === 'bengali'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                : 'text-gray-400 border-transparent hover:text-white hover:bg-[#1a1c24]'
            }`}
          >
            🇧🇩 বাংলা গাইড (Step-by-Step)
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1.5 rounded font-bold transition-all border ${
              activeTab === 'code'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                : 'text-gray-400 border-transparent hover:text-white hover:bg-[#1a1c24]'
            }`}
          >
            Arduino C++ Code (.ino)
          </button>
          <button
            onClick={() => setActiveTab('wiring')}
            className={`px-3 py-1.5 rounded font-bold transition-all border ${
              activeTab === 'wiring'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                : 'text-gray-400 border-transparent hover:text-white hover:bg-[#1a1c24]'
            }`}
          >
            Pinout &amp; Wiring Diagram
          </button>
          <button
            onClick={() => setActiveTab('steps')}
            className={`px-3 py-1.5 rounded font-bold transition-all border ${
              activeTab === 'steps'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                : 'text-gray-400 border-transparent hover:text-white hover:bg-[#1a1c24]'
            }`}
          >
            Architecture Overview
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-300 text-sm">
          {activeTab === 'bengali' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30">
                <h3 className="text-base font-bold text-indigo-300 flex items-center gap-2 mb-2">
                  <Lightbulb className="w-5 h-5 text-amber-400" />
                  কিভাবে প্রজেক্টটি কাজ করে? (Architecture Flow)
                </h3>
                <p className="leading-relaxed text-slate-300">
                  ১. <strong>ল্যাপটপ (Pilot Cockpit):</strong> আপনি যেকোনো ব্রাউজার থেকে গাড়িটি WASD কিবোর্ড, অনস্ক্রিন জয়স্টিক বা গেমপ্যাড দিয়ে চালাবেন।<br />
                  ২. <strong>ইন্টারনেট ও সিগন্যালিং সার্ভার:</strong> আপনার নির্দেশ এবং ভিডিও স্ট্রিম WebRTC এর মাধ্যমে আল্ট্রা লো-ল্যাটেন্সিতে (১০০-২০০ মিলি-সেকেন্ড) ট্রান্সফার হয়।<br />
                  ৩. <strong>গাড়ির ভিতরের অ্যান্ড্রয়েড ফোন (Car Gateway):</strong> গাড়ির ফ্রন্টে মাউন্ট করা ফোন ক্যামেরা দিয়ে লাইভ ভিডিও স্ট্রিম করে এবং ব্রাউজার থেকেই ব্লুটুথ (BLE) অথবা USB OTG ক্যাবল দিয়ে সরাসরি ESP32-কে কমান্ড পাঠায়।<br />
                  ৪. <strong>ESP32 মাইক্রোকন্ট্রোলার:</strong> মোটর ড্রাইভারকে (L298N/TB6612) PWM স্পিড সিগন্যাল পাঠিয়ে চাকাগুলো নিখুঁতভাবে নিয়ন্ত্রণ করে।
                </p>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-white uppercase tracking-wider">
                  প্রয়োজনীয় উপাদান (Component Checklist):
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700">
                    <strong className="text-white block">১. ESP32 Development Board</strong>
                    <span className="text-xs text-slate-400">NodeMCU ESP32 (Bluetooth Low Energy এবং PWM সাপোর্ট করে)</span>
                  </div>
                  <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700">
                    <strong className="text-white block">২. অ্যান্ড্রয়েড স্মার্টফোন (Android Phone)</strong>
                    <span className="text-xs text-slate-400">Google Chrome ব্রাউজার সহ, গাড়ির সামনে ক্যামেরামুখি মাউন্ট করা</span>
                  </div>
                  <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700">
                    <strong className="text-white block">৩. L298N অথবা TB6612FNG Motor Driver</strong>
                    <span className="text-xs text-slate-400">২টি বা ৪টি ডিসি গিয়ার মোটর চালানোর জন্য</span>
                  </div>
                  <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700">
                    <strong className="text-white block">৪. RC Car Chassis & DC Motors</strong>
                    <span className="text-xs text-slate-400">চাকা ও বডি ফ্রেম (2WD বা 4WD)</span>
                  </div>
                  <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700">
                    <strong className="text-white block">৫. লিথিয়াম ব্যাটারি প্যাক (7.4V বা 11.1V)</strong>
                    <span className="text-xs text-slate-400">2S বা 3S 18650 লি-আয়ন ব্যাটারি প্যাক</span>
                  </div>
                  <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700">
                    <strong className="text-white block">৬. এলইডি হেডলাইট ও বাযার (ঐচ্ছিক)</strong>
                    <span className="text-xs text-slate-400">রাতের আলো ও হর্নের জন্য</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white uppercase tracking-wider">
                  ধাপে ধাপে সেটআপ করার নিয়ম:
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-slate-300">
                  <li><strong>Arduino IDE তে কোড আপলোড করুন:</strong> উপরের <em>"Arduino C++ Code"</em> ট্যাব থেকে কোডটি কপি করুন অথবা ডাউনলোড করে Arduino IDE দিয়ে ESP32 তে ফ্ল্যাশ করুন।</li>
                  <li><strong>সার্কিট ওয়্যারিং করুন:</strong> পিনআউট ডায়াগ্রাম দেখে ESP32 এর সাথে L298N মোটর ড্রাইভার কানেক্ট করুন। খেয়াল রাখবেন <strong>ESP32 এর GND এবং ব্যাটারির GND একসাথে কমন করা বাধ্যতামূলক!</strong></li>
                  <li><strong>গাড়িতে অ্যান্ড্রয়েড ফোন মাউন্ট করুন:</strong> গাড়ির ফ্রন্ট ড্যাশবোর্ডে ফোনটি শক্ত করে আটকান।</li>
                  <li><strong>ফোনের ক্রোম ব্রাউজারে অ্যাপ ওপেন করুন:</strong> ফোনে <strong>Google Chrome</strong> ব্রাউজারে এই অ্যাপটি খুলুন (Brave ব্রাউজারে ডিফল্ট Web Bluetooth ব্লক করা থাকে; Brave এ চালাতে চাইলে <code>brave://flags</code> এ গিয়ে Web Bluetooth অন করতে হবে)। এরপর <em>"Car Gateway Mode"</em> সিলেক্ট করুন এবং Room ID দিন (যেমন <code>CAR01</code>)।</li>
                  <li><strong>ESP32 কানেক্ট করুন:</strong> ফোনে <em>"Connect Web Bluetooth (BLE)"</em> বাটনে চাপলে "TeleDrive-ESP32" দেখতে পাবেন, পেয়ার করে নিন। (অথবা USB OTG ক্যাবল লাগিয়ে Serial সিলেক্ট করতে পারেন)।</li>
                  <li><strong>ল্যাপটপ থেকে ড্রাইভ করুন:</strong> ল্যাপটপ থেকে <em>"Pilot Cockpit Mode"</em> ওপেন করে একই Room ID (<code>CAR01</code>) দিন। সাথে সাথে লাইভ ভিডিও দেখতে পাবেন এবং কিবোর্ড WASD দিয়ে পুরো গাড়ি যেকোনো স্থান থেকে চালাতে পারবেন!</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-300 font-medium">
                    Ready-to-flash Arduino C++ sketch for ESP32. Includes BLE service, Serial 115200 parser, and 600ms safety watchdog!
                  </p>
                  <span className="inline-block mt-1 text-[11px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded">
                    ✓ ESP32 Core v3.3.11+ &amp; v2.x Compatible (Automatic LEDC &amp; BLE Type Detection)
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1c24] hover:bg-[#252834] text-white rounded text-xs font-mono font-bold border border-white/10 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy Code'}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-black rounded text-xs font-mono font-bold shadow-[0_0_10px_rgba(34,211,238,0.3)] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download .ino
                  </button>
                </div>
              </div>

              <pre className="p-4 bg-slate-950 border border-[#1a1c24] rounded-xl text-xs font-mono text-emerald-400 overflow-x-auto max-h-[500px]">
                {ESP32_ARDUINO_CODE}
              </pre>
            </div>
          )}

          {activeTab === 'wiring' && (
            <div className="space-y-6">
              <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200">
                  <strong>Critical Wiring Note:</strong> Always connect the <strong>ESP32 GND</strong> to the <strong>Battery Negative (-)</strong> and <strong>L298N GND</strong>. Without common ground, the logic signals cannot travel correctly. Remove the ENA/ENB jumpers on L298N to enable variable PWM speed control!
                </div>
              </div>

              {WIRING_GUIDE.map((group, idx) => (
                <div key={idx} className="border border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-800/80 font-semibold text-white text-xs uppercase tracking-wider">
                    {group.component}
                  </div>
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-2">ESP32 Pin</th>
                        <th className="px-4 py-2">Connected Device Pin</th>
                        <th className="px-4 py-2">Function / Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {group.pins.map((pin, pidx) => (
                        <tr key={pidx} className="hover:bg-slate-800/30">
                          <td className="px-4 py-2 text-indigo-300 font-bold">{pin.espPin}</td>
                          <td className="px-4 py-2 text-emerald-300">{pin.compPin}</td>
                          <td className="px-4 py-2 text-slate-300 font-sans">{pin.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'steps' && (
            <div className="space-y-4">
              <h3 className="font-bold text-white text-base">End-to-End System Architecture</h3>
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 space-y-2">
                <div className="text-cyan-400">[Laptop Pilot Cockpit]</div>
                <div>  ├── Keyboard (WASD) / Joystick / USB Gamepad Controller</div>
                <div>  ├── Low-Latency WebRTC Video Receiver & HUD Telemetry</div>
                <div>  └── WebSocket Signaling & Fallback Command Relay</div>
                <div className="text-slate-500">            │ (Internet / LTE / 4G / 5G / WiFi)</div>
                <div className="text-cyan-400">[Cloud Server / Node.js Express + WebSockets]</div>
                <div>  ├── Room & Peer Coordinator</div>
                <div>  ├── WebRTC SDP & ICE Candidate Exchange</div>
                <div>  └── Low-latency Command Forwarder</div>
                <div className="text-slate-500">            │ (Internet)</div>
                <div className="text-cyan-400">[Android Smartphone (Car Dashboard Mounted)]</div>
                <div>  ├── WebRTC Camera H.264/VP8 Streamer (720p/480p @ 30/60fps)</div>
                <div>  ├── Web Bluetooth (BLE) / USB OTG Serial to ESP32</div>
                <div>  ├── Phone Battery & Gyroscope Roll/Pitch Sensors</div>
                <div>  └── Intercom Speaker (Pilot can talk to phone speaker)</div>
                <div className="text-slate-500">            │ (BLE / USB Serial Baud 115200)</div>
                <div className="text-cyan-400">[ESP32 Microcontroller]</div>
                <div>  ├── Motor Driver (L298N / TB6612) with PWM Differential Steering</div>
                <div>  ├── Headlights LED (GPIO 32) & Buzzer Horn (GPIO 33)</div>
                <div>  └── 500ms Watchdog Failsafe (auto-stop if signal lost)</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-xs text-slate-500">TeleDrive v2.4 • Open Source IoT Teleoperation</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
