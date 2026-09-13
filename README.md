# Teledrive 🚗📱💻

A comprehensive IoT remote drive solution connecting ESP32 microcontrollers, smartphones, and laptops for real-time vehicle control and monitoring.

## Overview

Teledrive is an innovative project that enables seamless communication and control between multiple device types:
- **ESP32 Microcontroller** - On-board vehicle controller
- **Mobile Phone** - Portable control and monitoring interface
- **Laptop** - Advanced monitoring and configuration dashboard

This project bridges the gap between embedded systems and modern applications, allowing users to interact with their vehicles from anywhere.

## Features

- 📡 **Real-time Communication** - WebSocket-based instant data transfer between devices
- 📱 **Mobile Control** - Full control interface accessible from smartphones
- 💻 **Laptop Dashboard** - Advanced monitoring and analytics dashboard
- 🔐 **Secure Connection** - Encrypted communication between all devices
- ⚡ **ESP32 Integration** - Efficient microcontroller communication protocol
- 📊 **Live Telemetry** - Real-time vehicle data streaming and visualization

## Technology Stack

- **TypeScript** (99.2%) - Primary language for all components
- **Node.js** - Backend server infrastructure
- **ESP32** - Embedded systems control
- **WebSocket** - Real-time bidirectional communication
- **React** (or similar) - Web/mobile frontend framework

## Project Structure

```
Teledrive/
├── esp32/              # ESP32 firmware and embedded code
├── mobile/             # Mobile application (TypeScript)
├── laptop/             # Laptop dashboard application
├── server/             # Backend server infrastructure
├── shared/             # Shared utilities and types
└── README.md           # This file
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn package manager
- ESP32 development board
- USB cable for ESP32 programming

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Jotimoy/Teledrive.git
   cd Teledrive
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Setup ESP32**
   - Flash the ESP32 firmware from the `esp32/` directory
   - Configure WiFi and server connection settings

5. **Start the application**
   ```bash
   npm start
   # or
   yarn start
   ```

## Usage

### Mobile App
- Launch the app on your smartphone
- Connect to the Teledrive server
- Control vehicle functions in real-time
- View live telemetry data

### Laptop Dashboard
- Open the web interface in your browser
- Access advanced analytics and logging
- Configure system settings
- Monitor multiple vehicles simultaneously

### ESP32 Device
- Receives commands from mobile/laptop interfaces
- Transmits vehicle telemetry and status
- Manages on-board hardware controllers

## API Documentation

### WebSocket Events

#### Device Connection
```typescript
// Connect to server
socket.emit('device:register', {
  type: 'esp32' | 'mobile' | 'laptop',
  id: 'device-unique-id'
});
```

#### Telemetry Data
```typescript
// Send vehicle data
socket.emit('telemetry:update', {
  speed: number,
  heading: number,
  location: { lat: number, lng: number },
  battery: number,
  // ... additional telemetry
});
```

#### Commands
```typescript
// Send control command
socket.emit('command:send', {
  action: 'accelerate' | 'brake' | 'steer',
  value: number
});
```

## Configuration

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
HOST=localhost

# WebSocket Configuration
WS_PORT=3001
WS_HOST=0.0.0.0

# ESP32 Configuration
ESP32_BAUD_RATE=115200
ESP32_PORT=/dev/ttyUSB0

# Security
JWT_SECRET=your_secret_key_here
ENABLE_SSL=true
```

## Development

### Build
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

### Testing
```bash
npm run test
```

### Linting
```bash
npm run lint
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Contact the maintainer: Jotimoy

## Acknowledgments

- ESP32 Community for excellent documentation
- Contributors and testers
- Open source projects that made this possible

## Roadmap

- [ ] Mobile app v2.0 with enhanced UI
- [ ] Cloud synchronization
- [ ] Multi-vehicle support
- [ ] Advanced analytics dashboard
- [ ] Voice control integration
- [ ] Mobile app store release
- [ ] REST API alongside WebSocket

---

**Teledrive** - Connecting your world on wheels 🌍
