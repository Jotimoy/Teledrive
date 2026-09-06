import React, { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Zap, Compass, ShieldAlert } from 'lucide-react';
import { DriveCommand } from '../types';

interface VirtualCarSimulatorProps {
  currentCommand: DriveCommand;
  onTelemetryUpdate?: (data: { speedKmh: number; roll: number; pitch: number; heading: number }) => void;
  renderToCanvasStream?: (canvas: HTMLCanvasElement) => void;
}

export const VirtualCarSimulator: React.FC<VirtualCarSimulatorProps> = ({
  currentCommand,
  onTelemetryUpdate,
  renderToCanvasStream
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Car physics state
  const stateRef = useRef({
    x: 400,
    y: 250,
    angle: 0,        // radians
    speed: 0,        // px/s
    steerAngle: 0,   // radians
    wheelBase: 44,   // length
    trail: [] as { x: number; y: number; alpha: number }[],
    headingDeg: 0,
    pitch: 0,
    roll: 0,
  });

  const [isRunning, setIsRunning] = useState(true);
  const [showCones, setShowCones] = useState(true);

  // Obstacles / Cones
  const conesRef = useRef([
    { x: 250, y: 150 },
    { x: 350, y: 150 },
    { x: 450, y: 150 },
    { x: 550, y: 150 },
    { x: 250, y: 350 },
    { x: 350, y: 350 },
    { x: 450, y: 350 },
    { x: 550, y: 350 },
    { x: 150, y: 250 },
    { x: 650, y: 250 },
  ]);

  const resetPosition = () => {
    stateRef.current.x = 400;
    stateRef.current.y = 250;
    stateRef.current.angle = 0;
    stateRef.current.speed = 0;
    stateRef.current.steerAngle = 0;
    stateRef.current.trail = [];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (renderToCanvasStream) {
      renderToCanvasStream(canvas);
    }

    let lastTime = performance.now();
    let animId: number;

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const car = stateRef.current;

      if (isRunning) {
        // Compute speed factor from gear
        const gearMultiplier = currentCommand.gear === 1 ? 0.45 : currentCommand.gear === 2 ? 0.75 : 1.0;
        const targetThrottle = currentCommand.brake ? 0 : (currentCommand.throttle / 100) * 260 * gearMultiplier;
        const targetSteer = (currentCommand.steer / 100) * 0.65; // Max 37 degrees steering angle

        // Smooth physics response
        car.steerAngle += (targetSteer - car.steerAngle) * Math.min(1, dt * 12);

        // Acceleration / Friction
        if (currentCommand.brake) {
          car.speed += (0 - car.speed) * Math.min(1, dt * 8);
        } else {
          car.speed += (targetThrottle - car.speed) * Math.min(1, dt * 4);
        }

        // Bicycle kinematic model for car motion
        const angularVelocity = (car.speed / car.wheelBase) * Math.tan(car.steerAngle);
        car.angle += angularVelocity * dt;

        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;

        // Boundary wrapping or collision
        if (car.x < 30) car.x = 30;
        if (car.x > canvas.width - 30) car.x = canvas.width - 30;
        if (car.y < 30) car.y = 30;
        if (car.y > canvas.height - 30) car.y = canvas.height - 30;

        // Add tire skid marks if turning hard or braking
        if (Math.abs(car.speed) > 40 && (Math.abs(car.steerAngle) > 0.3 || currentCommand.brake)) {
          car.trail.push({ x: car.x, y: car.y, alpha: 0.6 });
          if (car.trail.length > 80) car.trail.shift();
        }

        // Simulate gyro pitch & roll
        car.pitch = (car.speed / 260) * 6; // Slight pitch up under acceleration
        car.roll = (car.steerAngle * (car.speed / 260)) * 14; // Roll outward on turns
        car.headingDeg = Math.round((car.angle * 180 / Math.PI) % 360);
        if (car.headingDeg < 0) car.headingDeg += 360;

        // Send simulated telemetry update
        if (onTelemetryUpdate) {
          const speedKmh = Math.abs(Math.round((car.speed / 260) * 32));
          onTelemetryUpdate({
            speedKmh,
            roll: Math.round(car.roll * 10) / 10,
            pitch: Math.round(car.pitch * 10) / 10,
            heading: car.headingDeg
          });
        }
      }

      // DRAW CANVAS
      ctx.fillStyle = '#0f172a'; // Deep slate dark asphalt
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid track markings
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Track curb borders
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

      // Draw Tire Skidmarks
      for (let i = 0; i < car.trail.length; i++) {
        const p = car.trail[i];
        p.alpha -= dt * 0.05;
        if (p.alpha > 0) {
          ctx.fillStyle = `rgba(30, 41, 59, ${p.alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw Cones / Obstacles
      if (showCones) {
        conesRef.current.forEach((cone) => {
          ctx.save();
          ctx.translate(cone.x, cone.y);
          ctx.fillStyle = '#f97316'; // Orange traffic cone
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }

      // Draw Headlights Beam
      if (currentCommand.headlights) {
        ctx.save();
        ctx.translate(car.x, car.y);
        ctx.rotate(car.angle);

        const beamGrad = ctx.createRadialGradient(25, 0, 5, 120, 0, 100);
        beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
        beamGrad.addColorStop(0.5, 'rgba(254, 240, 138, 0.25)');
        beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');

        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(25, -12);
        ctx.lineTo(160, -65);
        ctx.lineTo(160, 65);
        ctx.lineTo(25, 12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Draw Car Body
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);

      // Car Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(-24, -14, 48, 28);

      // Car Chassis
      ctx.fillStyle = '#ef4444'; // Racing Red
      ctx.beginPath();
      ctx.roundRect(-22, -13, 44, 26, 4);
      ctx.fill();

      // Roof / Phone Mount
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(-10, -9, 20, 18, 3);
      ctx.fill();

      // Mounted Android Phone Screen & Camera Lens
      ctx.fillStyle = '#38bdf8'; // Blue screen glowing
      ctx.fillRect(-8, -7, 14, 14);

      ctx.fillStyle = '#10b981'; // Camera Lens (Green LED indicator)
      ctx.beginPath();
      ctx.arc(8, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Front Wheels with steering angle
      ctx.fillStyle = '#0f172a';
      // Front Left Wheel
      ctx.save();
      ctx.translate(14, -14);
      ctx.rotate(car.steerAngle);
      ctx.fillRect(-6, -3, 12, 6);
      ctx.restore();

      // Front Right Wheel
      ctx.save();
      ctx.translate(14, 14);
      ctx.rotate(car.steerAngle);
      ctx.fillRect(-6, -3, 12, 6);
      ctx.restore();

      // Rear Wheels (Fixed)
      ctx.fillRect(-16, -17, 12, 6);
      ctx.fillRect(-16, 11, 12, 6);

      // Headlight bulbs
      if (currentCommand.headlights) {
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(20, -11, 3, 5);
        ctx.fillRect(20, 6, 3, 5);
      }

      // Brake lights
      if (currentCommand.brake || currentCommand.throttle < 0) {
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(-23, -11, 3, 5);
        ctx.fillRect(-23, 6, 3, 5);
      }

      ctx.restore();

      // HUD Overlay on Simulator
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px monospace';
      ctx.fillText(`SIMULATOR: ${Math.round(car.speed)} px/s | Steer: ${Math.round((car.steerAngle * 180) / Math.PI)}° | Heading: ${car.headingDeg}°`, 30, 42);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isRunning, showCones, currentCommand, onTelemetryUpdate, renderToCanvasStream]);

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Interactive Car Physics & Track Simulator
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
            LIVE 60 FPS
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCones(!showCones)}
            className={`text-xs px-2.5 py-1 rounded transition-colors ${
              showCones ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
            }`}
          >
            Obstacles: {showCones ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={resetPosition}
            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Car
          </button>
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded font-medium transition-colors ${
              isRunning ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            {isRunning ? 'Running' : 'Paused'}
          </button>
        </div>
      </div>

      <div className="relative w-full aspect-[16/9] max-h-[380px] bg-slate-950 flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          width={800}
          height={450}
          className="w-full h-full object-contain"
        />
        <div className="absolute bottom-3 left-4 text-[11px] text-slate-400 bg-slate-900/80 px-2 py-1 rounded backdrop-blur border border-slate-700 pointer-events-none">
          Use WASD or on-screen controls to test drive this virtual model in real-time.
        </div>
      </div>
    </div>
  );
};
