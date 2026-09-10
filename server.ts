import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

interface ClientConnection {
  ws: WebSocket;
  role: "pilot" | "car";
  roomId: string;
  id: string;
  joinedAt: number;
}

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json());

// In-memory rooms tracking
const rooms = new Map<string, {
  car?: ClientConnection;
  pilots: Map<string, ClientConnection>;
  createdAt: number;
  lastActive: number;
}>();

// WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket, req) => {
  let clientInfo: ClientConnection | null = null;

  ws.on("message", (rawMessage: string) => {
    try {
      const msg = JSON.parse(rawMessage.toString());

      if (msg.type === "join") {
        const { role, roomId, clientId } = msg;
        if (!roomId || (role !== "pilot" && role !== "car")) {
          ws.send(JSON.stringify({ type: "error", message: "Invalid join payload" }));
          return;
        }

        const id = clientId || `${role}_${Math.random().toString(36).substring(2, 9)}`;
        clientInfo = { ws, role, roomId, id, joinedAt: Date.now() };

        if (!rooms.has(roomId)) {
          rooms.set(roomId, {
            pilots: new Map(),
            createdAt: Date.now(),
            lastActive: Date.now()
          });
        }

        const room = rooms.get(roomId)!;
        room.lastActive = Date.now();

        if (role === "car") {
          // If there's an existing car, close previous connection or overwrite
          if (room.car && room.car.ws !== ws && room.car.ws.readyState === WebSocket.OPEN) {
            room.car.ws.send(JSON.stringify({ type: "warning", message: "Replaced by a newer car gateway connection" }));
          }
          room.car = clientInfo;

          // Notify all pilots in room that car is online
          const carStatusMsg = JSON.stringify({
            type: "peer-status",
            role: "car",
            status: "online",
            carId: id,
            timestamp: Date.now()
          });
          for (const pilot of room.pilots.values()) {
            if (pilot.ws.readyState === WebSocket.OPEN) {
              pilot.ws.send(carStatusMsg);
            }
          }

          ws.send(JSON.stringify({
            type: "joined",
            role: "car",
            roomId,
            clientId: id,
            connectedPilots: room.pilots.size
          }));

        } else if (role === "pilot") {
          room.pilots.set(id, clientInfo);

          // Tell this pilot if car is already online
          ws.send(JSON.stringify({
            type: "joined",
            role: "pilot",
            roomId,
            clientId: id,
            carOnline: !!(room.car && room.car.ws.readyState === WebSocket.OPEN),
            carId: room.car?.id
          }));

          // Notify car that a pilot connected
          if (room.car && room.car.ws.readyState === WebSocket.OPEN) {
            room.car.ws.send(JSON.stringify({
              type: "peer-status",
              role: "pilot",
              status: "online",
              pilotId: id,
              timestamp: Date.now()
            }));
          }
        }
        return;
      }

      // Handle message forwarding within the room
      if (!clientInfo) {
        return;
      }

      const room = rooms.get(clientInfo.roomId);
      if (!room) return;
      room.lastActive = Date.now();

      // WebRTC Signaling: Offer, Answer, ICE Candidate
      if (msg.type === "signal") {
        if (clientInfo.role === "pilot") {
          // Forward signal to Car
          if (room.car && room.car.ws.readyState === WebSocket.OPEN) {
            room.car.ws.send(JSON.stringify({
              type: "signal",
              fromRole: "pilot",
              fromId: clientInfo.id,
              data: msg.data
            }));
          }
        } else if (clientInfo.role === "car") {
          // Forward signal to target pilot (or all pilots)
          const targetPilotId = msg.targetPilotId;
          if (targetPilotId && room.pilots.has(targetPilotId)) {
            const pilot = room.pilots.get(targetPilotId)!;
            if (pilot.ws.readyState === WebSocket.OPEN) {
              pilot.ws.send(JSON.stringify({
                type: "signal",
                fromRole: "car",
                fromId: clientInfo.id,
                data: msg.data
              }));
            }
          } else {
            // Broadcast to all pilots
            const payload = JSON.stringify({
              type: "signal",
              fromRole: "car",
              fromId: clientInfo.id,
              data: msg.data
            });
            for (const pilot of room.pilots.values()) {
              if (pilot.ws.readyState === WebSocket.OPEN) {
                pilot.ws.send(payload);
              }
            }
          }
        }
        return;
      }

      // Drive Command from Pilot -> Car
      if (msg.type === "drive-cmd") {
        if (clientInfo.role === "pilot" && room.car && room.car.ws.readyState === WebSocket.OPEN) {
          room.car.ws.send(JSON.stringify({
            type: "drive-cmd",
            fromPilot: clientInfo.id,
            cmd: msg.cmd,
            timestamp: msg.timestamp || Date.now()
          }));
        }
        return;
      }

      // Telemetry from Car -> Pilot(s)
      if (msg.type === "telemetry") {
        if (clientInfo.role === "car") {
          const payload = JSON.stringify({
            type: "telemetry",
            data: msg.data,
            timestamp: Date.now()
          });
          for (const pilot of room.pilots.values()) {
            if (pilot.ws.readyState === WebSocket.OPEN) {
              pilot.ws.send(payload);
            }
          }
        }
        return;
      }

      // Ping / Latency Echo
      if (msg.type === "ping") {
        ws.send(JSON.stringify({
          type: "pong",
          clientTimestamp: msg.timestamp,
          serverTimestamp: Date.now()
        }));
        return;
      }

      // Pilot requesting fresh car status / handshake
      if (msg.type === "query-car-status") {
        const isCarOnline = !!(room.car && room.car.ws.readyState === WebSocket.OPEN);
        ws.send(JSON.stringify({
          type: "peer-status",
          role: "car",
          status: isCarOnline ? "online" : "offline",
          carId: room.car?.id,
          timestamp: Date.now()
        }));
        if (isCarOnline && room.car) {
          // Tell car to re-initiate WebRTC handshake
          room.car.ws.send(JSON.stringify({
            type: "peer-status",
            role: "pilot",
            status: "online",
            pilotId: clientInfo.id,
            timestamp: Date.now()
          }));
        }
        return;
      }

      // Audio Talkback / Intercom signaling
      if (msg.type === "talkback") {
        if (clientInfo.role === "pilot" && room.car && room.car.ws.readyState === WebSocket.OPEN) {
          room.car.ws.send(JSON.stringify({
            type: "talkback",
            active: msg.active,
            fromPilot: clientInfo.id
          }));
        }
      }

    } catch (err) {
      console.error("WS error handling message:", err);
    }
  });

  ws.on("close", () => {
    if (clientInfo) {
      const room = rooms.get(clientInfo.roomId);
      if (room) {
        if (clientInfo.role === "car") {
          room.car = undefined;
          // Notify pilots
          const payload = JSON.stringify({
            type: "peer-status",
            role: "car",
            status: "offline",
            carId: clientInfo.id,
            timestamp: Date.now()
          });
          for (const pilot of room.pilots.values()) {
            if (pilot.ws.readyState === WebSocket.OPEN) {
              pilot.ws.send(payload);
            }
          }
        } else if (clientInfo.role === "pilot") {
          room.pilots.delete(clientInfo.id);
          // Notify car
          if (room.car && room.car.ws.readyState === WebSocket.OPEN) {
            room.car.ws.send(JSON.stringify({
              type: "peer-status",
              role: "pilot",
              status: "offline",
              pilotId: clientInfo.id,
              remainingPilots: room.pilots.size,
              timestamp: Date.now()
            }));
          }
        }

        // Clean up empty rooms after 1 hour
        if (!room.car && room.pilots.size === 0) {
          if (Date.now() - room.lastActive > 3600000) {
            rooms.delete(clientInfo.roomId);
          }
        }
      }
    }
  });
});

// REST APIs
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    activeRooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/rooms/:roomId/status", (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.json({ exists: false, carOnline: false, pilotsCount: 0 });
  }
  return res.json({
    exists: true,
    carOnline: !!(room.car && room.car.ws.readyState === WebSocket.OPEN),
    pilotsCount: room.pilots.size,
    createdAt: room.createdAt
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[TeleDrive] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
